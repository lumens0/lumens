/**
 * Fila durável de remoção de fotos do storage (`foto_a_remover`).
 *
 * Quem decide que um arquivo não tem mais dono (foto abandonada na pauta nova, conversa vencida,
 * `sair`) grava a chave aqui **na mesma transação** que muda o resto: se a transação desfaz, a chave
 * some junto e o arquivo continua valendo; se confirma, a chave fica registrada até o storage
 * confirmar a exclusão. Depois do commit (e a cada rodada da limpeza) `executarRemocoes` tenta apagar
 * e só tira a chave da fila quando o storage confirma. Storage fora do ar não perde nada: a próxima
 * rodada tenta de novo.
 */
import { fotosARemover, inArray, sql, type Db } from '@lumens/db';
import type { ServicoDeFotos } from './servico';

/** Quantas chaves cada rodada tenta: o suficiente para limpar o atraso sem segurar a conexão. */
export const LOTE_DE_REMOCAO = 200;

/** Põe as chaves na fila, na transação de quem chama. Chave que já está na fila não repete. */
export async function agendarRemocao(db: Db, chaves: readonly string[]): Promise<void> {
  const unicas = [...new Set(chaves)];
  if (unicas.length === 0) return;
  await db
    .insert(fotosARemover)
    .values(unicas.map((chave) => ({ chave })))
    .onConflictDoNothing({ target: fotosARemover.chave });
}

/**
 * Tenta apagar do storage o que está na fila e tira da fila só o que o storage confirmou. Devolve
 * quantas saíram. Nunca lança: falha do storage deixa a chave para a próxima rodada (e conta mais
 * uma tentativa).
 */
export async function executarRemocoes(
  db: Db,
  fotos: ServicoDeFotos | undefined,
  limite = LOTE_DE_REMOCAO,
): Promise<number> {
  if (fotos === undefined) return 0;
  if (fotos.removerConfirmando === undefined && fotos.removerFotos === undefined) return 0;
  try {
    const pendentes = await db
      .select({ chave: fotosARemover.chave })
      .from(fotosARemover)
      .orderBy(fotosARemover.enfileiradaEm, fotosARemover.chave)
      .limit(limite);
    if (pendentes.length === 0) return 0;
    const chaves = pendentes.map((p) => p.chave);
    // Sem `removerConfirmando` (um serviço que só sabe `removerFotos`), vale como confirmado o que não lançou.
    const removidas = fotos.removerConfirmando
      ? await fotos.removerConfirmando(chaves)
      : (await fotos.removerFotos?.(chaves), chaves);
    const feitas = new Set(removidas);
    if (feitas.size > 0) {
      await db.delete(fotosARemover).where(inArray(fotosARemover.chave, [...feitas]));
    }
    const falhas = chaves.filter((c) => !feitas.has(c));
    if (falhas.length > 0) {
      await db
        .update(fotosARemover)
        .set({ tentativas: sql`${fotosARemover.tentativas} + 1` })
        .where(inArray(fotosARemover.chave, falhas));
    }
    return feitas.size;
  } catch {
    return 0;
  }
}
