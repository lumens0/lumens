import { describe, expect, it } from 'vitest';
import { DISTANCIA_DO_DEDO, andar, passoDoGesto } from './lightbox';

describe('andar entre as fotos', () => {
  it('avança e volta dando a volta no começo e no fim', () => {
    expect(andar(0, 1, 3)).toBe(1);
    expect(andar(2, 1, 3)).toBe(0);
    expect(andar(0, -1, 3)).toBe(2);
    expect(andar(1, -1, 3)).toBe(0);
  });

  it('com uma foto ou nenhuma, fica no lugar', () => {
    expect(andar(0, 1, 1)).toBe(0);
    expect(andar(0, -1, 1)).toBe(0);
    expect(andar(0, 1, 0)).toBe(0);
  });
});

describe('gesto de dedo na foto ampliada', () => {
  it('arrastar para a esquerda passa para a próxima; para a direita, volta', () => {
    expect(passoDoGesto(-DISTANCIA_DO_DEDO - 10, 4)).toBe(1);
    expect(passoDoGesto(DISTANCIA_DO_DEDO + 10, -4)).toBe(-1);
  });

  it('toque, arrasto curto e rolagem na vertical não passam a foto', () => {
    expect(passoDoGesto(0, 0)).toBe(0);
    expect(passoDoGesto(-(DISTANCIA_DO_DEDO - 1), 0)).toBe(0);
    expect(passoDoGesto(-80, 120)).toBe(0);
  });
});
