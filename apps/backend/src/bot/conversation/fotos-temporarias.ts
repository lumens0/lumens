/**
 * Fotos da pauta nova que ainda não pertencem a nenhum relato.
 *
 * Na pauta nova, as fotos vão ao storage assim que chegam, mas só viram linha em `relato_foto` quando
 * a pauta é criada (`finalizar`). Até lá, as chaves existem só em `conversa.dados.fotoChaves`. Se a
 * pessoa abandona o fluxo (`menu`, `cancelar`, `sair`, um comando do site, a conversa expira ou a
 * criação falha), os dados somem e os arquivos ficariam no storage sem vínculo, fora do alcance do
 * `sair` (LGPD). Este módulo remove os arquivos que ficaram sem relato.
 */
import { inArray, relatoFotos, type Db } from '@lumens/db';
import type { ServicoDeFotos } from '../../fotos/servico';

/** As chaves de foto de uma conversa, lidas do JSON dos dados (que pode ser de outra versão). */
export function chavesDosDados(dados: unknown): string[] {
  if (typeof dados !== 'object' || dados === null) return [];
  const lidas = (dados as { fotoChaves?: unknown }).fotoChaves;
  return Array.isArray(lidas) ? lidas.filter((c): c is string => typeof c === 'string') : [];
}

/** As chaves, dentre `chaves`, que não são de nenhum relato (as que podem sair do storage). */
export async function fotosSoltas(db: Db, chaves: readonly string[]): Promise<string[]> {
  if (chaves.length === 0) return [];
  const usadas = await db
    .select({ chave: relatoFotos.chave })
    .from(relatoFotos)
    .where(inArray(relatoFotos.chave, [...chaves]));
  const emUso = new Set(usadas.map((u) => u.chave));
  return chaves.filter((c) => !emUso.has(c));
}

/**
 * Apaga do storage as chaves que não são de nenhum relato. Uma chave que já virou `relato_foto` (a
 * pauta foi criada) nunca é apagada. Melhor esforço: quem chama não depende do resultado.
 */
export async function removerFotosSoltas(
  db: Db,
  fotos: ServicoDeFotos | undefined,
  chaves: readonly string[],
): Promise<void> {
  if (fotos?.removerFotos === undefined) return;
  const soltas = await fotosSoltas(db, chaves);
  if (soltas.length > 0) await fotos.removerFotos(soltas);
}
