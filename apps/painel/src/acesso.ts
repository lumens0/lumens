/**
 * Quem entra no painel (5.1, RF-C01). Só curador com linha ativa na tabela `curador`; o e-mail é
 * achado pelo HMAC, nunca em claro. Fica fora do `auth.ts` para os testes não carregarem o Auth.js.
 */
import { createHmac } from 'node:crypto';
import { and, curadores, eq, gt, lt, verificacoesLogin, type Db } from '@lumens/db';
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
 * Já saiu um link para este e-mail há menos de `ESPERA_ENTRE_LINKS_S`? O link vence
 * `VALIDADE_DO_LINK_S` depois de criado, então "criado há menos de 60 s" é o mesmo que "vence daqui
 * a mais de 14 min": dispensa uma coluna de criação na tabela.
 */
export async function pedidoRecente(
  db: Db,
  email: string,
  chave: Buffer,
  agora: Date = new Date(),
): Promise<boolean> {
  const corte = new Date(agora.getTime() + (VALIDADE_DO_LINK_S - ESPERA_ENTRE_LINKS_S) * 1000);
  const [achado] = await db
    .select({ token: verificacoesLogin.token })
    .from(verificacoesLogin)
    .where(
      and(
        eq(verificacoesLogin.identificador, hmacDoEmail(email, chave)),
        gt(verificacoesLogin.expiraEm, corte),
      ),
    )
    .limit(1);
  return achado !== undefined;
}

/** Pedidos aceitos nos últimos 60 s por este processo, por e-mail: fecha a janela entre dois pedidos simultâneos. */
const reservas = new Map<string, number>();

/** `true` e reserva o e-mail se não há pedido nos últimos 60 s neste processo; `false` se há. */
export function reservarPedido(email: string, agora: number = Date.now()): boolean {
  for (const [chave, quando] of reservas) {
    if (agora - quando >= ESPERA_ENTRE_LINKS_S * 1000) reservas.delete(chave);
  }
  const chave = normalizarEmail(email);
  if (reservas.has(chave)) return false;
  reservas.set(chave, agora);
  return true;
}

export type DecisaoDoPedido = 'enviar' | 'repetido' | 'nao_curador';

/**
 * O que fazer com um pedido de link (SCRUM-305). As duas consultas rodam sempre, para curador ou
 * não, para o tempo da resposta não separar um do outro. Curador com link de menos de 60 s (no
 * banco ou reservado por um pedido simultâneo) recebe a mesma tela, sem novo e-mail.
 */
export async function decidirPedidoDeLink(
  db: Db,
  email: string,
  chave: Buffer,
): Promise<DecisaoDoPedido> {
  const [curador, recente] = await Promise.all([
    curadorAtivo(db, email, chave),
    pedidoRecente(db, email, chave),
  ]);
  if (!curador) return 'nao_curador';
  return recente || !reservarPedido(email) ? 'repetido' : 'enviar';
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
   * Quando informado, a gravação do link sai do caminho da resposta: o pedido de um curador não
   * gasta mais tempo que o de quem não é (SCRUM-305). Sem ele (testes), grava e espera.
   */
  depois?: (identificador: string, gravacao: Promise<void>) => void,
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
      const gravar = async () => {
        await db.delete(verificacoesLogin).where(lt(verificacoesLogin.expiraEm, new Date()));
        await db.insert(verificacoesLogin).values({
          identificador: hmacDoEmail(v.identifier, chave),
          token: v.token,
          expiraEm: v.expires,
        });
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
