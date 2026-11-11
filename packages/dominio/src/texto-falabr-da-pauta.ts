/**
 * O texto do Fala.BR de uma pauta do banco (3.4, SCRUM-213).
 *
 * `gerarTextoFalaBr` é puro: recebe os campos e devolve o texto. Aqui ficam a leitura da pauta, do
 * bloco e da contagem de apoios, para o bot não montar essa consulta por conta própria.
 */
import { apoios, blocos, eq, pautas, sql, type Db, type Tx } from '@lumens/db';
import { gerarTextoFalaBr, type TextoFalaBr } from './texto-falabr';

/** Devolve `undefined` quando a pauta não existe. */
export async function textoFalaBrDaPauta(
  db: Db | Tx,
  pautaId: string,
): Promise<TextoFalaBr | undefined> {
  const [pauta] = await db
    .select({
      titulo: pautas.titulo,
      descricao: pautas.descricao,
      categoria: pautas.categoria,
      meta: pautas.meta,
      bloco: blocos.nome,
    })
    .from(pautas)
    .leftJoin(blocos, eq(blocos.id, pautas.blocoId))
    .where(eq(pautas.id, pautaId));
  if (pauta === undefined) return undefined;

  const [contagem] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(apoios)
    .where(eq(apoios.pautaId, pautaId));

  return gerarTextoFalaBr({ ...pauta, apoios: contagem?.total ?? 0 });
}
