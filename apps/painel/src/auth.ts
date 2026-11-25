/**
 * Login do painel por link no e-mail (5.1, SCRUM-164). Sessão em JWT, 7 dias; link de 15 minutos
 * que vale uma vez. Só curador ativo recebe o link; quem não é curador recebe um aviso dizendo isso
 * (SCRUM-400), e a tela de "confira seu e-mail" é a mesma para qualquer endereço: quem tenta não
 * descobre quem é da curadoria.
 */
import { criarDb, criarPool, type Db } from '@lumens/db';
import type { ChavesDeCurador } from '@lumens/dominio';
import NextAuth from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Nodemailer from 'next-auth/providers/nodemailer';
import { after } from 'next/server';
import { createTransport } from 'nodemailer';
import { VALIDADE_DO_LINK_S, adaptador, curadorAtivo, curadorAtivoPorId } from './acesso';
import { avisarNaoCurador } from './aviso-nao-curador';
import { configBase } from './auth.config';
import { criarEnvioDoLink } from './envio';
import { opcoesSmtp } from './smtp';

/**
 * A mesma URL que o Auth.js devolve depois de mandar o link: o redirecionamento de quem não é
 * curador fica idêntico ao de quem é, e a resposta não entrega quem faz parte da curadoria.
 */
const VERIFIQUE = '/api/auth/verify-request?provider=nodemailer&type=email';

function exigir(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`${nome} não configurada no ambiente do painel. Veja o README.`);
  return valor;
}

// Um pool por processo, criado no primeiro pedido: o build não precisa do banco.
let conexao: { db: Db; chave: Buffer } | undefined;
export function servidor(): { db: Db; chave: Buffer } {
  conexao ??= {
    db: criarDb(
      criarPool(exigir('DATABASE_URL'), { conexaoMs: 5000, consultaMs: 15_000 }, (erro) => {
        console.error('Conexão do painel com o banco caiu:', erro.message);
      }),
    ),
    chave: Buffer.from(exigir('CHAVE_HMAC'), 'base64'),
  };
  return conexao;
}

/**
 * O e-mail do curador vai cifrado com a CHAVE_CIFRA_PAINEL, só dele: o painel não recebe a
 * CHAVE_CIFRA, que abre telefone e e-mail dos estudantes (SCRUM-303).
 */
export function chavesDeCurador(): ChavesDeCurador {
  const cifra = Buffer.from(exigir('CHAVE_CIFRA_PAINEL'), 'base64');
  const { chave: hmac } = servidor();
  if (cifra.length !== 32 || cifra.equals(hmac)) {
    throw new Error(
      'CHAVE_CIFRA_PAINEL precisa ter 32 bytes em base64 (openssl rand -base64 32) e ser diferente da CHAVE_HMAC.',
    );
  }
  return { cifra, hmac };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const { db, chave } = servidor();
  const segredo = exigir('AUTH_SECRET');
  const smtp = opcoesSmtp({
    host: exigir('EMAIL_HOST'),
    porta: Number(exigir('EMAIL_PORT')),
    usuario: exigir('EMAIL_USUARIO'),
    senha: exigir('EMAIL_SENHA'),
  });
  const envio = criarEnvioDoLink(segredo, (pedido) =>
    createTransport(smtp)
      .sendMail({
        to: pedido.identifier,
        from: pedido.from,
        subject: 'Seu link de acesso ao painel do Lumens',
        text:
          'Para entrar no painel de curadoria, abra este link:\n\n' +
          pedido.url +
          '\n\nEle vale por 15 minutos e uma vez só. Se não foi você quem pediu, ignore este e-mail.',
      })
      .then(() => undefined),
  );
  return {
    ...configBase,
    adapter: adaptador(db, chave, (tokenEmHash, gravacao) => {
      const guardada = envio.guardar(tokenEmHash, gravacao);
      // Mantém o processo vivo até a gravação acabar; o erro é tratado no envio.
      after(() =>
        guardada.then(
          () => undefined,
          () => undefined,
        ),
      );
    }),
    providers: [
      // Cast: o tipo do Nodemailer não fecha com `exactOptionalPropertyTypes` (o `server` dele é
      // opcional no tipo genérico e obrigatório no próprio); em tempo de execução é o mesmo objeto.
      Nodemailer({
        server: smtp,
        from: exigir('EMAIL_REMETENTE'),
        maxAge: VALIDADE_DO_LINK_S,
        // O mesmo segredo que o Auth.js usa para o hash do token: `envio` o refaz para achar o pedido.
        secret: segredo,
        // O e-mail sai depois da resposta (`after`). Esperar o SMTP aqui deixaria o pedido de um
        // curador segundos mais lento que o de quem não é, e a demora entregaria quem é curador.
        sendVerificationRequest({ identifier, url, provider, token }) {
          after(() => envio.enviar({ identifier, url, from: provider.from, token }));
        },
      }) as Provider,
    ],
    callbacks: {
      ...configBase.callbacks,
      // No pedido do link: não curador não recebe nada, mas vê a mesma tela. O limite de um link
      // por minuto é aplicado depois da resposta, em `reservarEnvio`. No clique: confere de novo,
      // para um curador desativado nesse meio-tempo não entrar.
      async signIn({ user, email }) {
        const curador = user.email ? await curadorAtivo(db, user.email, chave) : undefined;
        if (curador) return true;
        // SCRUM-400: quem não é curador também recebe um e-mail, dizendo isso, depois da resposta e
        // com limite por endereço e geral. A tela é a mesma, então a lista de curadores não vaza.
        if (email?.verificationRequest && user.email) {
          const para = user.email;
          after(() =>
            avisarNaoCurador(db, chave, para, (destinatario, assunto, texto) =>
              createTransport(smtp)
                .sendMail({
                  to: destinatario,
                  from: exigir('EMAIL_REMETENTE'),
                  subject: assunto,
                  text: texto,
                })
                .then(() => undefined),
            ),
          );
        }
        return email?.verificationRequest ? VERIFIQUE : false;
      },
    },
  };
});

/**
 * Quem está pedindo, conferido no banco. O JWT da sessão vale 7 dias; sem esta checagem, um
 * curador desativado continuaria entrando até ele vencer. Toda rota e página do painel usa isto.
 */
export async function curadorDaSessao(): Promise<
  { id: string; nome: string; papel: 'curador' | 'administrador' } | undefined
> {
  const id = (await auth())?.user?.id;
  return id ? curadorAtivoPorId(servidor().db, id) : undefined;
}
