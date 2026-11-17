/** Situação da pauta, igual ao enum `status_pauta` do banco. */
export type StatusDaPauta =
  | 'em_curadoria'
  | 'recusada'
  | 'juntando_apoios'
  | 'meta_batida'
  | 'cobrando'
  | 'prometido'
  | 'entregue_em_parte'
  | 'descumprida'
  | 'conquistada';

/**
 * Cor da "janela acesa" de cada status, a mesma no site e no painel. A cor nunca é o único sinal:
 * o rótulo vem sempre junto. Cobrança, promessa e entrega em parte dividem a mesma luz.
 */
export const COR_DO_STATUS: Record<StatusDaPauta, string> = {
  em_curadoria: '#9ea2b8',
  recusada: '#9ea2b8',
  juntando_apoios: '#4f8cff',
  meta_batida: '#14b8a6',
  cobrando: '#ffa41b',
  prometido: '#ffa41b',
  entregue_em_parte: '#ffa41b',
  descumprida: '#ff5a4a',
  conquistada: '#2ec27e',
};
