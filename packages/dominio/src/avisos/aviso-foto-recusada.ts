/**
 * Aviso de foto recusada: quem enviou a foto fica sabendo que a curadoria não a publicou e por quê.
 *
 * Vai só para quem escreveu o relato (não para os responsáveis da pauta) e só se a pessoa não saiu
 * do Lumens. O aviso leva o título da pauta e o motivo digitado pela curadoria; nunca o nome de
 * quem decidiu. O texto do relato e as outras fotos não são afetados.
 */
import { and, eq, estudantes, isNull, pautas, relatos, type Tx } from '@lumens/db';
import { enfileirarDisparos } from './fila';

/** Mensagem modelo: título da pauta e motivo da recusa. */
export const MODELO_FOTO_RECUSADA = 'lumens_foto_recusada';

/** Enfileira o aviso de uma foto recusada. Devolve 1 se entrou na fila, 0 se não há para quem. */
export async function enfileirarAvisoDeFotoRecusada(
  tx: Tx,
  {
    fotoId,
    relatoId,
    motivo,
    agora = new Date(),
  }: { fotoId: string; relatoId: string; motivo: string; agora?: Date },
): Promise<number> {
  const [autor] = await tx
    .select({ estudanteId: relatos.estudanteId, titulo: pautas.titulo })
    .from(relatos)
    .innerJoin(pautas, eq(pautas.id, relatos.pautaId))
    .innerJoin(estudantes, and(eq(estudantes.id, relatos.estudanteId), isNull(estudantes.saiuEm)))
    .where(eq(relatos.id, relatoId));
  if (autor === undefined) return 0;
  return enfileirarDisparos(
    tx,
    [
      {
        tipo: 'foto_recusada',
        aviso: fotoId,
        estudanteId: autor.estudanteId,
        modelo: MODELO_FOTO_RECUSADA,
        parametros: [autor.titulo, motivo],
      },
    ],
    agora,
  );
}
