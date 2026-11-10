/**
 * Promessa oficial (RN13): a curadoria registra o resumo da resposta e a data prometida. A pauta vai
 * para `prometido`, a conferência "Foi feito?" fica agendada para a data de entrega, por 7 dias, e
 * quem apoia recebe o aviso de resposta oficial pela fila de envio (RNF06).
 */
import { and, apoios, eq, estudantes, isNull, pautas, promessas, sql, type Tx } from '@lumens/db';
import { ErroDeRegra } from './erros';
import { registrarEvento } from './eventos';
import { enfileirarDisparos } from './fila';
import { transicionarStatus } from './status';

/** Mensagem modelo (SCRUM-193): título, fonte e, no botão "Ver a pauta", o slug. */
export const MODELO_RESPOSTA_OFICIAL = 'lumens_resposta_oficial';

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
 *
 * Na mesma transação, enfileira o aviso para cada apoiador que não saiu do sistema: se a promessa
 * não for gravada, ninguém é avisado. Promessa nova depois de `descumprida` avisa de novo, porque o
 * aviso é por promessa.
 */
export async function registrarPromessa(
  tx: Tx,
  { pautaId, resumo, dataEntrega, fonte, registradaPor }: NovaPromessa,
): Promise<{
  promessaId: string;
  conferenciaAbreEm: Date;
  conferenciaFechaEm: Date;
  avisados: number;
}> {
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

  const [pauta] = await tx
    .select({ titulo: pautas.titulo, slug: pautas.slug })
    .from(pautas)
    .where(eq(pautas.id, pautaId));
  if (pauta === undefined) throw new Error('pauta sumiu na transação');

  const apoiadores = await tx
    .select({ estudanteId: apoios.estudanteId })
    .from(apoios)
    .innerJoin(estudantes, eq(estudantes.id, apoios.estudanteId))
    .where(and(eq(apoios.pautaId, pautaId), isNull(estudantes.saiuEm)));

  const parametros = [pauta.titulo, fonte, pauta.slug];
  const avisados = await enfileirarDisparos(
    tx,
    apoiadores.map(({ estudanteId }) => ({
      tipo: 'resposta_oficial' as const,
      aviso: promessa.id,
      estudanteId,
      modelo: MODELO_RESPOSTA_OFICIAL,
      parametros,
    })),
  );

  return {
    promessaId: promessa.id,
    conferenciaAbreEm: abre,
    conferenciaFechaEm: fecha,
    avisados,
  };
}
