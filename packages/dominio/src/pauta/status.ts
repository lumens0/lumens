/**
 * Mudança de status da pauta: a única porta para `pauta.status`.
 *
 * Só aceita as transições da tabela abaixo (roteiro da Parte 1, seção 4.2) e registra cada uma na
 * linha do tempo. A regra central do Lumens fica aqui: só a apuração da conferência, pelo
 * agendador, leva a pauta a um resultado. Nem owner nem curadoria marcam conquista.
 */
import { eq, pautas, sql, type StatusPauta, type Tx } from '@lumens/db';
import { ErroDeRegra } from '../compartilhado/erros';
import { registrarEvento, type OrigemEvento } from '../compartilhado/eventos';

export const TRANSICOES: Readonly<Record<StatusPauta, readonly StatusPauta[]>> = {
  em_curadoria: ['juntando_apoios', 'recusada'],
  recusada: [],
  juntando_apoios: ['meta_batida', 'cobrando'],
  meta_batida: ['cobrando'],
  cobrando: ['prometido'],
  // `cobrando`: a conferência ficou sem quórum duas vezes e a pauta volta a ser cobrada
  // (SCRUM-308). Só a apuração faz essa volta, como os três resultados.
  prometido: ['conquistada', 'entregue_em_parte', 'descumprida', 'cobrando'],
  entregue_em_parte: ['prometido'],
  // Promessa descumprida volta a ser cobrada, ou recebe uma promessa nova.
  descumprida: ['cobrando', 'prometido'],
  conquistada: [],
};

/** Resultados da conferência (RN10): só a apuração, pelo agendador, chega neles. */
const RESULTADOS: ReadonlySet<StatusPauta> = new Set([
  'conquistada',
  'entregue_em_parte',
  'descumprida',
]);

/**
 * Transições que só o agendador faz: os resultados e a volta de `prometido` a `cobrando` depois de
 * duas conferências sem quórum. A curadoria desfazer uma promessa na mão tiraria da base a decisão
 * que a RN10 dá a ela.
 */
function soDoAgendador(de: StatusPauta, para: StatusPauta): boolean {
  return RESULTADOS.has(para) || (de === 'prometido' && para === 'cobrando');
}

/** A transição está na tabela? Pura: o painel usa para saber quais botões mostrar. */
export function podeTransicionar(de: StatusPauta, para: StatusPauta): boolean {
  return TRANSICOES[de].includes(para);
}

export interface Transicao {
  pautaId: string;
  para: StatusPauta;
  origem: OrigemEvento;
  /** Obrigatório para `recusada` (RF-C02); vai para `pauta.motivo_recusa`. */
  motivo?: string | undefined;
  agora?: Date;
}

/**
 * Muda o status da pauta e registra `status_alterado`, na transação de quem chama.
 *
 * Lança `ErroDeRegra` (e a transação inteira é desfeita) quando a pauta não existe, a transição
 * está fora da tabela, a recusa vem sem motivo ou um resultado da conferência não vem do agendador.
 */
export async function transicionarStatus(
  tx: Tx,
  { pautaId, para, origem, motivo, agora = new Date() }: Transicao,
): Promise<{ de: StatusPauta; para: StatusPauta }> {
  // FOR UPDATE: duas transições concorrentes da mesma pauta esperam uma pela outra, e a segunda
  // valida contra o status que a primeira deixou.
  const [pauta] = await tx
    .select({ status: pautas.status })
    .from(pautas)
    .where(eq(pautas.id, pautaId))
    .for('update');

  if (pauta === undefined) {
    throw new ErroDeRegra('pauta_inexistente', 'Pauta não encontrada.');
  }

  const de = pauta.status;
  if (!podeTransicionar(de, para)) {
    throw new ErroDeRegra('transicao_invalida', `A pauta não pode ir de ${de} para ${para}.`);
  }
  if (soDoAgendador(de, para) && origem !== 'agendador') {
    throw new ErroDeRegra(
      'transicao_invalida',
      'Só a apuração da conferência define o resultado de uma promessa.',
    );
  }

  const motivoLimpo = motivo?.trim() ?? '';
  if (para === 'recusada' && motivoLimpo === '') {
    throw new ErroDeRegra('motivo_obrigatorio', 'Recusar uma pauta exige um motivo.');
  }

  await tx
    .update(pautas)
    .set({
      status: para,
      ...(para === 'juntando_apoios' && { aprovadaEm: agora }),
      // Só preenche se ainda estiver vazio: quem bateu a meta pelo apoio já gravou o instante.
      ...(para === 'meta_batida' && {
        metaBatidaEm: sql`coalesce(${pautas.metaBatidaEm}, ${agora.toISOString()}::timestamptz)`,
      }),
      ...(para === 'recusada' && { motivoRecusa: motivoLimpo }),
    })
    .where(eq(pautas.id, pautaId));

  await registrarEvento(tx, { pautaId, tipo: 'status_alterado', dados: { de, para }, origem });

  return { de, para };
}
