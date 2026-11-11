/**
 * Fechamento da conferência "Foi feito?" (RN10), chamado pelo agendador quando a janela de 7 dias
 * acaba. É a única forma de uma pauta virar conquista.
 *
 * A regra em si é a função pura `apurarConferencia`; aqui ficam a contagem no banco, a gravação do
 * resultado na promessa, a mudança de status e o evento, tudo numa transação.
 */
import { and, apoios, eq, promessas, respostasConferencia, sql, type Tx } from '@lumens/db';
import { apurarConferencia, type ResultadoApuracao } from './conferencia';
import { registrarEvento } from '../compartilhado/eventos';
import { transicionarStatus } from '../pauta/status';

export type ResultadoEncerramento =
  | { apurada: true; resultado: ResultadoApuracao; respondentes: number; apoiadores: number }
  | { apurada: false; motivo: 'promessa_inexistente' | 'conferencia_aberta' | 'ja_apurada' };

/**
 * Apura a conferência de uma promessa e aplica o resultado.
 *
 * "Apoiadores" é quem já apoiava quando a conferência abriu: quem apoiou depois não entra no
 * denominador nem tem a resposta contada, para o quórum não mudar com a janela aberta.
 *
 * Idempotente: promessa já apurada devolve `ja_apurada` e nada muda.
 */
export async function encerrarConferencia(
  tx: Tx,
  { promessaId, agora = new Date() }: { promessaId: string; agora?: Date },
): Promise<ResultadoEncerramento> {
  // FOR UPDATE: o agendador rodando duas vezes ao mesmo tempo não apura a mesma promessa duas vezes.
  const [promessa] = await tx
    .select({
      pautaId: promessas.pautaId,
      abreEm: promessas.conferenciaAbreEm,
      fechaEm: promessas.conferenciaFechaEm,
      resultado: promessas.resultado,
    })
    .from(promessas)
    .where(eq(promessas.id, promessaId))
    .for('update');

  if (promessa === undefined) return { apurada: false, motivo: 'promessa_inexistente' };
  if (promessa.resultado !== null) return { apurada: false, motivo: 'ja_apurada' };
  if (agora < promessa.fechaEm) return { apurada: false, motivo: 'conferencia_aberta' };

  const apoiouAteAbrir = and(
    eq(apoios.pautaId, promessa.pautaId),
    sql`${apoios.criadoEm} <= ${promessa.abreEm.toISOString()}::timestamptz`,
  );

  const [base] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(apoios)
    .where(apoiouAteAbrir);
  const apoiadores = base?.total ?? 0;

  const contagem = await tx
    .select({ resposta: respostasConferencia.resposta, total: sql<number>`count(*)::int` })
    .from(respostasConferencia)
    .innerJoin(apoios, eq(apoios.estudanteId, respostasConferencia.estudanteId))
    .where(and(eq(respostasConferencia.promessaId, promessaId), apoiouAteAbrir))
    .groupBy(respostasConferencia.resposta);

  const respostas = { sim: 0, em_parte: 0, nao: 0 };
  for (const { resposta, total } of contagem) respostas[resposta] = total;

  const { resultado, respondentes } = apurarConferencia({ apoiadores, respostas });

  await tx.update(promessas).set({ resultado }).where(eq(promessas.id, promessaId));

  // ponytail: sem quórum a pauta fica em `prometido` até existir o status `sem_conferencia`
  // decidido na SCRUM-190 (migration no enum + transição na T11).
  if (resultado !== 'sem_quorum') {
    await transicionarStatus(tx, {
      pautaId: promessa.pautaId,
      para: resultado,
      origem: 'agendador',
      agora,
    });
  }

  await registrarEvento(tx, {
    pautaId: promessa.pautaId,
    tipo: 'conferencia_apurada',
    dados: { promessa_id: promessaId, resultado, total_respostas: respondentes },
    origem: 'agendador',
  });

  return { apurada: true, resultado, respondentes, apoiadores };
}
