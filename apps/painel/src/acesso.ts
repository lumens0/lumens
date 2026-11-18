/**
 * Quem entra no painel (5.1, RF-C01). Só curador com linha ativa na tabela `curador`; o e-mail é
 * achado pelo HMAC, nunca em claro. Fica fora do `auth.ts` para os testes não carregarem o Auth.js.
 */
import { createHmac } from 'node:crypto';
import {
  and,
  curadores,
  eq,
  lt,
  lte,
  pedidosLinkLogin,
  verificacoesLogin,
  type Db,
} from '@lumens/db';
import type { Adapter, AdapterUser } from 'next-auth/adapters';

/** Quanto o link vale, em segundos. */
export const VALIDADE_DO_LINK_S = 15 * 60;
/** Intervalo mínimo entre dois links para o mesmo e-mail (SCRUM-305). */
export const ESPERA_ENTRE_LINKS_S = 60;

export const normalizarEmail = (email: string) => email.trim().toLowerCase();

/** Mesmo cálculo de `hmacDoEmailDeCurador` em `@lumens/dominio`, que grava o curador. */
export function hmacDoEmail(email: string, chave: Buffer): string {
  return createHmac('sha256', chave).update(normalizarEmail(email)).digest('hex');
}

export async function curadorAtivo(
  db: Db,
  email: string,
  chave: Buffer,
): Promise<{ id: string; nome: string } | undefined> {
  const [curador] = await db
    .select({ id: curadores.id, nome: curadores.nome })
    .from(curadores)
    .where(and(eq(curadores.emailHmac, hmacDoEmail(email, chave)), eq(curadores.ativo, true)));
  return curador;
}

/**
 * Reserva o direito de enviar um link a este e-mail (SCRUM-305): `true` se o último envio foi há
 * `ESPERA_ENTRE_LINKS_S` ou mais (ou nunca), e grava o instante; `false` se foi há menos. A
 * verificação e a gravação são um só INSERT ... ON CONFLICT DO UPDATE ... WHERE, decidido pelas
 * linhas afetadas: dois pedidos simultâneos não passam juntos. O instante fica em registro próprio,
 * que não some quando o link é usado (o token é apagado ao ser consumido).
 */
export async function reservarEnvio(
  db: Db,
  email: string,
  chave: Buffer,
  agora: Date = new Date(),
): Promise<boolean> {
  const limite = new Date(agora.getTime() - ESPERA_ENTRE_LINKS_S * 1000);
  // Quem pediu há mais de um dia já pode pedir de novo: a linha não precisa ficar.
  await db
    .delete(pedidosLinkLogin)
    .where(lt(pedidosLinkLogin.ultimoEnvioEm, new Date(agora.getTime() - 24 * 3600 * 1000)));
  const reservados = await db
    .insert(pedidosLinkLogin)
    .values({ identificador: hmacDoEmail(email, chave), ultimoEnvioEm: agora })
    .onConflictDoUpdate({
      target: pedidosLinkLogin.identificador,
      set: { ultimoEnvioEm: agora },
      setWhere: lte(pedidosLinkLogin.ultimoEnvioEm, limite),
    })
    .returning({ identificador: pedidosLinkLogin.identificador });
  return reservados.length > 0;
}

/**
 * O curador da sessão, se ainda estiver ativo, com o papel de agora (não o do login). Desativar
 * ou rebaixar tira o acesso já no pedido seguinte.
 */
export async function curadorAtivoPorId(
  db: Db,
  id: string,
): Promise<{ id: string; nome: string; papel: 'curador' | 'administrador' } | undefined> {
  const [curador] = await db
    .select({ id: curadores.id, nome: curadores.nome, papel: curadores.papel })
    .from(curadores)
    .where(and(eq(curadores.id, id), eq(curadores.ativo, true)));
  return curador;
}

/**
 * Adapter mínimo do Auth.js: só o que o login por link pede com sessão em JWT. O "usuário" é o
 * curador; ninguém é criado pelo login (curador é adicionado pela tela /curadores; o primeiro, pelo script).
 */
export function adaptador(
  db: Db,
  chave: Buffer,
  /**
   * Quando informado, a reserva e a gravação do link saem do caminho da resposta: o pedido de um
   * curador não gasta mais tempo que o de quem não é (SCRUM-305). A promessa vale `true` se o
   * link foi gravado e pode ser enviado, `false` se o limite de um por minuto o barrou. Sem ele
   * (testes), reserva e grava na hora.
   */
  depois?: (identificador: string, gravacao: Promise<boolean>) => void,
): Adapter {
  const comoUsuario = (id: string, nome: string, email: string): AdapterUser => ({
    id,
    name: nome,
    email: normalizarEmail(email),
    emailVerified: null,
  });

  return {
    async getUserByEmail(email) {
      const curador = await curadorAtivo(db, email, chave);
      return curador ? comoUsuario(curador.id, curador.nome, email) : null;
    },
    // No clique do link o Auth.js chama isto só com o id, para marcar `emailVerified` (que não
    // guardamos); o que voltar aqui vira a sessão, então o nome vem do banco.
    async updateUser({ id, email }) {
      const curador = await curadorAtivoPorId(db, id);
      return comoUsuario(id, curador?.nome ?? '', email ?? '');
    },
    createUser() {
      throw new Error('O login não cria curador; use o script de adicionar curador.');
    },
    // O e-mail entra como HMAC, nunca em claro. E cada link novo leva junto os vencidos que
    // ninguém usou: a tabela não acumula pedidos esquecidos.
    async createVerificationToken(v) {
      const gravar = async (): Promise<boolean> => {
        if (!(await reservarEnvio(db, v.identifier, chave))) return false;
        await db.delete(verificacoesLogin).where(lt(verificacoesLogin.expiraEm, new Date()));
        await db.insert(verificacoesLogin).values({
          identificador: hmacDoEmail(v.identifier, chave),
          token: v.token,
          expiraEm: v.expires,
        });
        return true;
      };
      if (depois) depois(normalizarEmail(v.identifier), gravar());
      else await gravar();
      return v;
    },
    // Apaga ao ler: o link vale uma vez só, mesmo com dois cliques ao mesmo tempo.
    async useVerificationToken({ identifier, token }) {
      const [usado] = await db
        .delete(verificacoesLogin)
        .where(
          and(
            eq(verificacoesLogin.identificador, hmacDoEmail(identifier, chave)),
            eq(verificacoesLogin.token, token),
          ),
        )
        .returning();
      return usado ? { identifier, token: usado.token, expires: usado.expiraEm } : null;
    },
  };
}
