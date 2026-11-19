import { UUID } from './pautas/[id]/decisoes';

/**
 * Para onde o navegador volta depois de uma ação que aparece em mais de uma tela (recusar foto,
 * decidir pedido de edição). O destino vem de um campo do formulário, então só vale o que o painel
 * conhece: nunca um endereço de fora.
 */
export function destinoDeVolta(voltar: string, padrao: string): string {
  if (voltar === '/relatos' || voltar === '/pedidos') return voltar;
  const pauta = /^\/pautas\/([^/?#]+)$/.exec(voltar);
  if (pauta?.[1] !== undefined && UUID.test(pauta[1])) return voltar;
  return padrao;
}

/** Junta `?chave=valor` ao destino. */
export function comParametro(destino: string, chave: string, valor: string): string {
  return `${destino}?${chave}=${encodeURIComponent(valor)}`;
}
