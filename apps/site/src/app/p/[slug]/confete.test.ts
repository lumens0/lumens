import { describe, expect, it } from 'vitest';
import { confete } from './confete';

const area = { largura: 1080, altura: 1920 };
const cores = ['#ffc23d', '#36864f', '#ffffff'];

describe('confete', () => {
  it('é determinístico: a mesma pauta sempre tem o mesmo confete', () => {
    expect(confete('goteira', 40, area, cores)).toEqual(confete('goteira', 40, area, cores));
  });

  it('pautas diferentes têm confetes diferentes', () => {
    expect(confete('goteira', 40, area, cores)).not.toEqual(confete('bebedouro', 40, area, cores));
  });

  it('gera a quantidade pedida, dentro da área, com as cores dadas', () => {
    const pecas = confete('x', 60, area, cores);
    expect(pecas).toHaveLength(60);
    for (const p of pecas) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.largura).toBeLessThanOrEqual(area.largura);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(area.altura);
      expect(cores).toContain(p.cor);
    }
    expect(new Set(pecas.map((p) => p.cor)).size).toBe(cores.length);
  });

  it('peça redonda é um círculo (largura igual à altura)', () => {
    for (const p of confete('x', 60, area, cores).filter((c) => c.redonda)) {
      expect(p.largura).toBe(p.altura);
    }
  });
});
