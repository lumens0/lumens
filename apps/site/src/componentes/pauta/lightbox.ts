/** Lógica pura da foto ampliada (sem DOM), para testar sem navegador. */

/** O índice depois de andar `passo` fotos, dando a volta no começo e no fim. */
export function andar(indice: number, passo: 1 | -1, total: number): number {
  if (total <= 0) return 0;
  return (indice + passo + total) % total;
}

/** Quanto o dedo precisa andar na horizontal, em px, para valer como "passar a foto". */
export const DISTANCIA_DO_DEDO = 48;

/**
 * O que um gesto de dedo quer dizer: `1` (próxima, dedo foi para a esquerda), `-1` (anterior) ou
 * `0` (toque, rolagem na vertical ou arrasto curto). Mais vertical que horizontal não conta.
 */
export function passoDoGesto(dx: number, dy: number): 1 | -1 | 0 {
  if (Math.abs(dx) < DISTANCIA_DO_DEDO || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}
