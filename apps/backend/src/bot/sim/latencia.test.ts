import { describe, expect, it } from 'vitest';
import { PRAZO_META_MS, medirLatencia } from './latencia';

/** Relógio falso: cada pedido "demora" o tempo da lista, sem depender da máquina. */
function comTempos(tempos: number[], status: number[] = []) {
  let relogio = 0;
  return medirLatencia(
    (i) => {
      relogio += tempos[i] ?? 0;
      return Promise.resolve(status[i] ?? 200);
    },
    tempos.length,
    () => relogio,
  );
}

describe('medirLatencia', () => {
  it('resume os tempos em p50, p95 e máximo', async () => {
    const tempos = Array.from({ length: 20 }, (_, i) => (i + 1) * 10); // 10, 20, ..., 200
    const r = await comTempos([...tempos].reverse());

    expect(r.amostras).toHaveLength(20);
    expect(r.p50).toBe(100);
    expect(r.p95).toBe(190);
    expect(r.max).toBe(200);
    expect(r).toMatchObject({ falhas: 0, dentroDoPrazo: true });
  });

  it.each([
    ['um ms abaixo do prazo', PRAZO_META_MS - 1, true],
    ['exatamente no prazo', PRAZO_META_MS, false],
    ['acima do prazo', PRAZO_META_MS + 1, false],
  ])('pedido mais lento %s', async (_caso, lento, dentro) => {
    expect((await comTempos([5, lento, 5])).dentroDoPrazo).toBe(dentro);
  });

  it('resposta diferente de 200 conta como falha, mesmo rápida', async () => {
    const r = await comTempos([5, 5, 5], [200, 401, 200]);
    expect(r).toMatchObject({ falhas: 1, dentroDoPrazo: false });
  });

  it('recusa quantidade inválida', async () => {
    await expect(medirLatencia(() => Promise.resolve(200), 0)).rejects.toThrow(RangeError);
  });
});
