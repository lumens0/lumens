/**
 * Login do painel por link no e-mail (5.1, SCRUM-164). Sessão em JWT, 7 dias; link de 15 minutos
 * que vale uma vez. Só curador ativo recebe e-mail, mas a tela de "confira seu e-mail" é a mesma
 * para qualquer endereço: quem tenta não descobre quem é da curadoria.
 */
import { criarDb, criarPool, type Db } from '@lumens/db';
import NextAuth from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Nodemailer from 'next-auth/providers/nodemailer';
import { createTransport } from 'nodemailer';
import { adaptador, curadorAtivo, curadorAtivoPorId } from './acesso';
import { configBase } from './auth.config';

const QUINZE_MINUTOS = 15 * 60;

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

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const { db, chave } = servidor();
  const smtp = {
    host: exigir('EMAIL_HOST'),
    port: Number(exigir('EMAIL_PORT')),
    auth: { user: exigir('EMAIL_USUARIO'), pass: exigir('EMAIL_SENHA') },
  };
  return {
    ...configBase,
    adapter: adaptador(db, chave),
    providers: [
      // Cast: o tipo do Nodemailer não fecha com `exactOptionalPropertyTypes` (o `server` dele é
      // opcional no tipo genérico e obrigatório no próprio); em tempo de execução é o mesmo objeto.
      Nodemailer({
        server: smtp,
        from: exigir('EMAIL_REMETENTE'),
        maxAge: QUINZE_MINUTOS,
        async sendVerificationRequest({ identifier, url, provider }) {
          await createTransport(smtp).sendMail({
            to: identifier,
            from: provider.from,
            subject: 'Seu link de acesso ao painel do Lumens',
            text:
              `Para entrar no painel de curadoria, abra este link:\n\n${url}\n\n` +
              'Ele vale por 15 minutos e uma vez só. Se não foi você quem pediu, ignore este e-mail.',
          });
        },
      }) as Provider,
    ],
    callbacks: {
      ...configBase.callbacks,
      // No pedido do link: não curador não recebe nada, mas vê a mesma tela. No clique: confere
      // de novo, para um curador desativado nesse meio-tempo não entrar.
      async signIn({ user, email }) {
        const curador = user.email ? await curadorAtivo(db, user.email, chave) : undefined;
        if (curador) return true;
        return email?.verificationRequest ? VERIFIQUE : false;
      },
    },
  };
});

/**
 * Quem está pedindo, conferido no banco. O JWT da sessão vale 7 dias; sem esta checagem, um
 * curador desativado continuaria entrando até ele vencer. Toda rota e página do painel usa isto.
 */
export async function curadorDaSessao(): Promise<{ id: string; nome: string } | undefined> {
  const id = (await auth())?.user?.id;
  return id ? curadorAtivoPorId(servidor().db, id) : undefined;
}
