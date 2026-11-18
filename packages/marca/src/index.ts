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
 * Cor da "janela acesa" de cada status, a mesma no site e no painel (SCRUM-317). Cada etapa tem a
 * sua cor, sem repetir e sem o âmbar da marca; contraste mínimo de 3:1 sobre o papel e sobre a
 * noite. A cor nunca é o único sinal: o rótulo vem sempre junto.
 */
export const COR_DO_STATUS: Record<StatusDaPauta, string> = {
  em_curadoria: '#74788c',
  recusada: '#646876',
  juntando_apoios: '#356fc2',
  meta_batida: '#8959bd',
  cobrando: '#c05b12',
  prometido: '#168b86',
  entregue_em_parte: '#a98216',
  descumprida: '#d0443b',
  conquistada: '#36864f',
};
