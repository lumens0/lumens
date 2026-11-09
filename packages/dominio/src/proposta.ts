/**
 * Execução de uma proposta da comunidade (RN09): vira conquista parcial na linha do tempo, mas a
 * pauta continua sendo cobrada. Por isso não passa por `transicionarStatus`.
 */
import { eq, propostas, type Tx } from '@lumens/db';
import { registrarEvento } from './eventos';

export type ResultadoExecucao =
  { executada: true } | { executada: false; motivo: 'proposta_inexistente' | 'ja_executada' };

export async function registrarExecucaoProposta(
  tx: Tx,
  { propostaId, agora = new Date() }: { propostaId: string; agora?: Date },
): Promise<ResultadoExecucao> {
  const [proposta] = await tx
    .select({ pautaId: propostas.pautaId, status: propostas.status })
    .from(propostas)
    .where(eq(propostas.id, propostaId))
    .for('update');

  if (proposta === undefined) return { executada: false, motivo: 'proposta_inexistente' };
  // Repetir a confirmação (o bot perdeu a resposta) não gera um segundo evento.
  if (proposta.status === 'executada') return { executada: false, motivo: 'ja_executada' };

  await tx
    .update(propostas)
    .set({ status: 'executada', executadaEm: agora })
    .where(eq(propostas.id, propostaId));

  await registrarEvento(tx, {
    pautaId: proposta.pautaId,
    tipo: 'proposta_executada',
    dados: { proposta_id: propostaId },
    origem: 'bot',
  });

  return { executada: true };
}
