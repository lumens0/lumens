/**
 * Proposta da comunidade (3.5, RF-B14, RF-B16, RN09): o owner publica o que a própria comunidade
 * pode fazer, estudantes entram na lista de voluntários ("Vou ajudar") e, feita, a proposta vira
 * conquista parcial na linha do tempo, mas a pauta continua sendo cobrada. Por isso a execução não
 * passa por `transicionarStatus`.
 *
 * Quem se voluntariou não aparece em lugar nenhum: o site só mostra quantos são.
 */
import { and, eq, pautas, propostas, sql, voluntarios, type Db, type Tx } from '@lumens/db';
import { STATUS_COM_CAMINHOS, recusaDoOwner } from './caminhos';
import { registrarEvento } from './eventos';

export interface NovaProposta {
  pautaId: string;
  /** Só owner ativo da pauta publica proposta. */
  porEstudanteId: string;
  descricao: string;
  pessoasNecessarias: number;
}

export type ResultadoPublicacao =
  | { publicada: true; propostaId: string }
  | { publicada: false; motivo: 'nao_e_owner' | 'pauta_fechada' };

/** Publica a proposta e registra `proposta_publicada`. */
export async function publicarProposta(
  tx: Tx,
  { pautaId, porEstudanteId, descricao, pessoasNecessarias }: NovaProposta,
): Promise<ResultadoPublicacao> {
  const recusa = await recusaDoOwner(tx, pautaId, porEstudanteId);
  if (recusa !== null) return { publicada: false, motivo: recusa };

  const [proposta] = await tx
    .insert(propostas)
    .values({ pautaId, descricao: descricao.trim(), pessoasNecessarias })
    .returning({ id: propostas.id });
  if (proposta === undefined) throw new Error('proposta não criada');

  await registrarEvento(tx, {
    pautaId,
    tipo: 'proposta_publicada',
    dados: { proposta_id: proposta.id, pessoas_necessarias: pessoasNecessarias },
    origem: 'bot',
  });
  return { publicada: true, propostaId: proposta.id };
}

export interface PropostaAberta {
  id: string;
  descricao: string;
  pessoasNecessarias: number;
  voluntarios: number;
}

/** Propostas ainda abertas de uma pauta, com quantos já se voluntariaram. */
export function propostasAbertas(db: Db, pautaId: string): Promise<PropostaAberta[]> {
  return db
    .select({
      id: propostas.id,
      descricao: propostas.descricao,
      pessoasNecessarias: propostas.pessoasNecessarias,
      voluntarios: sql<number>`(select count(*) from ${voluntarios} where ${voluntarios.propostaId} = ${propostas.id})::int`,
    })
    .from(propostas)
    .where(and(eq(propostas.pautaId, pautaId), eq(propostas.status, 'aberta')))
    .orderBy(propostas.id);
}

export type ResultadoVoluntario =
  | { registrado: true; jaEstava: boolean; proposta: PropostaAberta }
  | { registrado: false; motivo: 'proposta_inexistente' | 'proposta_encerrada' };

/**
 * "Vou ajudar" (RF-B16): põe o estudante na lista de voluntários. Repetir não duplica nem dá erro,
 * a pessoa só fica sabendo que já estava. Proposta feita ou pauta que terminou não aceita mais.
 */
export async function registrarVoluntario(
  tx: Tx,
  { propostaId, estudanteId }: { propostaId: string; estudanteId: string },
): Promise<ResultadoVoluntario> {
  // FOR SHARE: a execução (FOR UPDATE) espera; voluntário aceito aqui conta na proposta aberta.
  const [proposta] = await tx
    .select({
      descricao: propostas.descricao,
      pessoasNecessarias: propostas.pessoasNecessarias,
      status: propostas.status,
      statusPauta: pautas.status,
    })
    .from(propostas)
    .innerJoin(pautas, eq(pautas.id, propostas.pautaId))
    .where(eq(propostas.id, propostaId))
    .for('share', { of: propostas });

  if (proposta === undefined) return { registrado: false, motivo: 'proposta_inexistente' };
  if (proposta.status !== 'aberta' || !STATUS_COM_CAMINHOS.includes(proposta.statusPauta)) {
    return { registrado: false, motivo: 'proposta_encerrada' };
  }

  const novo = await tx
    .insert(voluntarios)
    .values({ propostaId, estudanteId })
    .onConflictDoNothing()
    .returning({ propostaId: voluntarios.propostaId });
  const [{ total } = { total: 0 }] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(voluntarios)
    .where(eq(voluntarios.propostaId, propostaId));

  return {
    registrado: true,
    jaEstava: novo.length === 0,
    proposta: {
      id: propostaId,
      descricao: proposta.descricao,
      pessoasNecessarias: proposta.pessoasNecessarias,
      voluntarios: total,
    },
  };
}

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
