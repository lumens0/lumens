// Mede o tempo de resposta do webhook (SCRUM-97): a Meta espera o 200 em até 5 segundos e
// reenvia o evento quando ele não chega.

/** Prazo da Meta para o webhook responder. */
export const PRAZO_META_MS = 5_000;

export interface Latencia {
  /** Tempo de cada pedido, em ms, na ordem em que foram feitos. */
  amostras: number[];
  p50: number;
  p95: number;
  max: number;
  /** Pedidos que não responderam 200. */
  falhas: number;
  /** Todos responderam 200, e o mais lento ficou abaixo do prazo da Meta. */
  dentroDoPrazo: boolean;
}

/** O menor valor que deixa pelo menos `p`% das amostras abaixo ou iguais a ele. */
function percentil(ordenadas: readonly number[], p: number): number {
  return ordenadas[Math.max(0, Math.ceil((p / 100) * ordenadas.length) - 1)] ?? 0;
}

/**
 * Faz `vezes` pedidos, um depois do outro, e resume os tempos.
 *
 * @param enviar faz um pedido (recebe o índice, a partir de 0) e devolve o status HTTP.
 * @param agora relógio em ms; trocável nos testes.
 */
export async function medirLatencia(
  enviar: (i: number) => Promise<number>,
  vezes: number,
  agora: () => number = () => performance.now(),
): Promise<Latencia> {
  if (!Number.isInteger(vezes) || vezes < 1) {
    throw new RangeError(`vezes inválido: ${String(vezes)}`);
  }

  const amostras: number[] = [];
  let falhas = 0;
  for (let i = 0; i < vezes; i++) {
    const inicio = agora();
    const status = await enviar(i);
    amostras.push(agora() - inicio);
    if (status !== 200) falhas++;
  }

  const ordenadas = [...amostras].sort((a, b) => a - b);
  const max = ordenadas.at(-1) ?? 0;
  return {
    amostras,
    p50: percentil(ordenadas, 50),
    p95: percentil(ordenadas, 95),
    max,
    falhas,
    dentroDoPrazo: falhas === 0 && max < PRAZO_META_MS,
  };
}
