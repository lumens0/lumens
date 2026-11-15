/**
 * Quem pode entrar no painel de curadoria (SCRUM-295). Porta de escrita de `curador` e de
 * `curador_auditoria`: cada mudança e o seu registro de auditoria confirmam ou desfazem juntos.
 *
 * O e-mail nunca fica em claro: vai cifrado (AES-256-GCM, CHAVE_CIFRA) para o administrador poder
 * ler na lista, e com HMAC (CHAVE_HMAC), que é como o login acha o curador
 * (`apps/painel/src/acesso.ts` faz o mesmo cálculo). A auditoria guarda só ids.
 *
 * Quem chama confere se o autor é administrador ativo; aqui ficam as regras que valem sempre.
 */
import { createHmac } from 'node:crypto';
import { and, curadorAuditoria, curadores, eq, type Db } from '@lumens/db';
import { cifrar, decifrar } from '../compartilhado/cifra';

/** As duas chaves já decodificadas do base64 (32 bytes cada). */
export interface ChavesDeCurador {
  cifra: Buffer;
  hmac: Buffer;
}

export type MotivoRecusaCurador =
  | 'email_invalido'
  | 'nome_obrigatorio'
  | 'ja_ativo'
  | 'inexistente'
  | 'ja_inativo'
  | 'proprio_curador'
  | 'ultimo_administrador';

export type ResultadoCurador =
  { feito: true; curadorId: string } | { feito: false; motivo: MotivoRecusaCurador };

export interface CuradorListado {
  id: string;
  nome: string;
  email: string;
  papel: 'curador' | 'administrador';
  ativo: boolean;
  criadoEm: Date;
}

const EMAIL_UFAL = /^[^\s@]+@ufal\.br$/;

/** O HMAC com que o login acha o curador: e-mail sem espaços e em minúsculas. */
export function hmacDoEmailDeCurador(email: string, chave: Buffer): string {
  return createHmac('sha256', chave).update(email.trim().toLowerCase()).digest('hex');
}

/**
 * Adiciona um curador, ou reativa quem já existe com esse e-mail (sem duplicar e sem mudar o papel
 * que a pessoa já tinha). Só e-mail @ufal.br.
 *
 * `autorId` ausente é o primeiro administrador, criado pelo script: a pessoa consta como autora da
 * própria entrada na auditoria.
 */
export async function adicionarCurador(
  db: Db,
  chaves: ChavesDeCurador,
  {
    autorId,
    email,
    nome,
    papel = 'curador',
  }: { autorId?: string; email: string; nome: string; papel?: 'curador' | 'administrador' },
): Promise<ResultadoCurador> {
  const normalizado = email.trim().toLowerCase();
  if (!EMAIL_UFAL.test(normalizado)) return { feito: false, motivo: 'email_invalido' };
  const nomeLimpo = nome.trim();
  if (!nomeLimpo) return { feito: false, motivo: 'nome_obrigatorio' };

  const emailHmac = hmacDoEmailDeCurador(normalizado, chaves.hmac);
  return db.transaction(async (tx) => {
    const [existente] = await tx
      .select({ id: curadores.id, ativo: curadores.ativo })
      .from(curadores)
      .where(eq(curadores.emailHmac, emailHmac))
      .for('update');
    if (existente?.ativo) return { feito: false, motivo: 'ja_ativo' };

    let alvoId: string;
    if (existente) {
      await tx.update(curadores).set({ ativo: true }).where(eq(curadores.id, existente.id));
      alvoId = existente.id;
    } else {
      const [novo] = await tx
        .insert(curadores)
        .values({
          emailHmac,
          emailCifrado: cifrar(normalizado, chaves.cifra),
          nome: nomeLimpo,
          papel,
        })
        .returning({ id: curadores.id });
      if (!novo) throw new Error('O banco não devolveu o curador criado.');
      alvoId = novo.id;
    }
    await tx.insert(curadorAuditoria).values({
      acao: existente ? 'reativou' : 'adicionou',
      autorId: autorId ?? alvoId,
      alvoId,
    });
    return { feito: true, curadorId: alvoId };
  });
}

/** Tira o acesso. Ninguém desativa a si mesmo, e o último administrador ativo fica. */
export async function desativarCurador(
  db: Db,
  { autorId, alvoId }: { autorId: string; alvoId: string },
): Promise<ResultadoCurador> {
  if (autorId === alvoId) return { feito: false, motivo: 'proprio_curador' };
  return db.transaction(async (tx) => {
    // Trava os administradores ativos: duas desativações ao mesmo tempo não zeram o grupo.
    const administradores = await tx
      .select({ id: curadores.id })
      .from(curadores)
      .where(and(eq(curadores.papel, 'administrador'), eq(curadores.ativo, true)))
      .for('update');
    const [alvo] = await tx
      .select({ ativo: curadores.ativo, papel: curadores.papel })
      .from(curadores)
      .where(eq(curadores.id, alvoId))
      .for('update');
    if (!alvo) return { feito: false, motivo: 'inexistente' };
    if (!alvo.ativo) return { feito: false, motivo: 'ja_inativo' };
    if (alvo.papel === 'administrador' && administradores.length <= 1) {
      return { feito: false, motivo: 'ultimo_administrador' };
    }
    await tx.update(curadores).set({ ativo: false }).where(eq(curadores.id, alvoId));
    await tx.insert(curadorAuditoria).values({ acao: 'desativou', autorId, alvoId });
    return { feito: true, curadorId: alvoId };
  });
}

/** Devolve o acesso a quem foi desativado. */
export async function reativarCurador(
  db: Db,
  { autorId, alvoId }: { autorId: string; alvoId: string },
): Promise<ResultadoCurador> {
  return db.transaction(async (tx) => {
    const [alvo] = await tx
      .select({ ativo: curadores.ativo })
      .from(curadores)
      .where(eq(curadores.id, alvoId))
      .for('update');
    if (!alvo) return { feito: false, motivo: 'inexistente' };
    if (alvo.ativo) return { feito: false, motivo: 'ja_ativo' };
    await tx.update(curadores).set({ ativo: true }).where(eq(curadores.id, alvoId));
    await tx.insert(curadorAuditoria).values({ acao: 'reativou', autorId, alvoId });
    return { feito: true, curadorId: alvoId };
  });
}

/** Todos, ativos primeiro e por nome, com o e-mail decifrado: só para mostrar a administrador. */
export async function listarCuradores(db: Db, chaves: ChavesDeCurador): Promise<CuradorListado[]> {
  const linhas = await db
    .select({
      id: curadores.id,
      nome: curadores.nome,
      emailCifrado: curadores.emailCifrado,
      papel: curadores.papel,
      ativo: curadores.ativo,
      criadoEm: curadores.criadoEm,
    })
    .from(curadores);
  return linhas
    .map(({ emailCifrado, ...resto }) => ({
      ...resto,
      email: decifrar(emailCifrado, chaves.cifra),
    }))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
