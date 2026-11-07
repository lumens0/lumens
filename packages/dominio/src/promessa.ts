/**
 * Promessa oficial (RN13): a curadoria registra o resumo da resposta e a data prometida. A pauta vai
 * para `prometido` e a conferência "Foi feito?" fica agendada para a data de entrega, por 7 dias.
 */
import { and, eq, promessas, sql, type Tx } from '@lumens/db';
import { ErroDeRegra } from './erros';
import { registrarEvento } from './eventos';
import { transicionarStatus } from './status';

/** Janela da conferência (RN10). */
export const DIAS_DE_CONFERENCIA = 7;

const MS_POR_DIA = 86_400_000;

export interface NovaPromessa {
  pautaId: string;
  resumo: string;
  /** Dia prometido, em `YYYY-MM-DD`. A conferência abre nele. */
  dataEntrega: string;
  fonte: string;
  /** Curador que registrou. */
  registradaPor: string;
}

/**
 * Início do dia em Maceió (UTC−3, sem horário de verão) como instante.
 * Lança `ErroDeRegra` para data fora do formato ou inexistente (31/02).
 */
function inicioDoDiaEmMaceio(dia: string): Date {
  const instante = new Date(`${dia}T00:00:00-03:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(instante.getTime())) {
    throw new ErroDeRegra('data_invalida', `Data de entrega inválida: ${dia}`);
  }
  // `new Date` aceita 2026-02-31 e vira 3 de março; a volta pelo fuso confere o dia.
  const deVolta = new Date(instante.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
  if (deVolta !== dia) throw new ErroDeRegra('data_invalida', `Data de entrega inválida: ${dia}`);
  return instante;
}

/**
 * Registra a promessa e leva a pauta a `prometido`, na transação de quem chama.
 *
 * Só aceita a partir de `cobrando`, `entregue_em_parte` ou `descumprida` (via `transicionarStatus`);
 * fora disso lança `ErroDeRegra` e nada é gravado. Se ainda houver promessa ativa, ela é encerrada
 * como `substituida` antes: o banco só aceita uma ativa por pauta.
 */
export async function registrarPromessa(
  tx: Tx,
  { pautaId, resumo, dataEntrega, fonte, registradaPor }: NovaPromessa,
): Promise<{ promessaId: string; conferenciaAbreEm: Date; conferenciaFechaEm: Date }> {
  const abre = inicioDoDiaEmMaceio(dataEntrega);
  const fecha = new Date(abre.getTime() + DIAS_DE_CONFERENCIA * MS_POR_DIA);

  // Primeiro a transição: se a pauta não pode ir para `prometido`, nada abaixo acontece.
  await transicionarStatus(tx, { pautaId, para: 'prometido', origem: 'curadoria' });

  await tx
    .update(promessas)
    .set({ resultado: 'substituida' })
    .where(and(eq(promessas.pautaId, pautaId), sql`${promessas.resultado} is null`));

  const [promessa] = await tx
    .insert(promessas)
    .values({
      pautaId,
      resumo,
      dataEntrega,
      fonte,
      registradaPor,
      conferenciaAbreEm: abre,
      conferenciaFechaEm: fecha,
    })
    .returning({ id: promessas.id });
  if (promessa === undefined) throw new Error('promessa não criada');

  await registrarEvento(tx, {
    pautaId,
    tipo: 'promessa_registrada',
    dados: { promessa_id: promessa.id, data_entrega: dataEntrega },
    origem: 'curadoria',
  });

  return { promessaId: promessa.id, conferenciaAbreEm: abre, conferenciaFechaEm: fecha };
}
