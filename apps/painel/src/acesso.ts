/**
 * Quem entra no painel (5.1, RF-C01). Só curador com linha ativa na tabela `curador`; o e-mail é
 * achado pelo HMAC, nunca em claro. Fica fora do `auth.ts` para os testes não carregarem o Auth.js.
 */
import { createHmac } from 'node:crypto';
import { and, curadores, eq, lt, verificacoesLogin, type Db } from '@lumens/db';
import type { Adapter, AdapterUser } from 'next-auth/adapters';

export const normalizarEmail = (email: string) => email.trim().toLowerCase();

/** Mesmo cálculo do script que adiciona curador (`pnpm --filter @lumens/backend curador`). */
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

/** O curador da sessão, se ainda estiver ativo. Desativar tira o acesso já no pedido seguinte. */
export async function curadorAtivoPorId(
  db: Db,
  id: string,
): Promise<{ id: string; nome: string } | undefined> {
  const [curador] = await db
    .select({ id: curadores.id, nome: curadores.nome })
    .from(curadores)
    .where(and(eq(curadores.id, id), eq(curadores.ativo, true)));
  return curador;
}

/**
 * Adapter mínimo do Auth.js: só o que o login por link pede com sessão em JWT. O "usuário" é o
 * curador; ninguém é criado pelo login (adicionar curador é pelo script).
 */
export function adaptador(db: Db, chave: Buffer): Adapter {
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
      await db.delete(verificacoesLogin).where(lt(verificacoesLogin.expiraEm, new Date()));
      await db.insert(verificacoesLogin).values({
        identificador: hmacDoEmail(v.identifier, chave),
        token: v.token,
        expiraEm: v.expires,
      });
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
