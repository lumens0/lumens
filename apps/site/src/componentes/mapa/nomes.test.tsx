import { describe, expect, it } from 'vitest';
import { contem, pontoDentro, pontoDoNome } from './nomes';
import { PREDIOS } from './predios';

describe('ponto do nome (SCRUM-284)', () => {
  it('num prédio em L, o nome fica sob a parte larga, não no vão do L', () => {
    // Barra de cima de 0 a 100 (10 de altura) e perna à direita, de 90 a 100, descendo até 60.
    const l = 'M0 0L100 0L100 60L90 60L90 10L0 10Z';
    const [x, y] = pontoDoNome(l, [0, 0, 100, 60]);
    expect(x).toBeCloseTo(50, 0);
    // Na borda de baixo da barra, e não no pé da caixa (60), que fica no vão.
    expect(y).toBeCloseTo(10, 5);
  });

  it('num retângulo, o nome fica no meio da borda de baixo, como antes', () => {
    expect(pontoDoNome('M10 20L50 20L50 40L10 40Z', [10, 20, 40, 20])).toEqual([30, 40]);
  });

  it('todo prédio do mapa tem o ponto do nome dentro da própria caixa', () => {
    for (const p of PREDIOS) {
      const [x = 0, y = 0, w = 0, h = 0] = p.caixa;
      expect(p.rotulo[0], p.nome).toBeGreaterThanOrEqual(x - 0.01);
      expect(p.rotulo[0], p.nome).toBeLessThanOrEqual(x + w + 0.01);
      expect(p.rotulo[1], p.nome).toBeGreaterThanOrEqual(y - 0.01);
      expect(p.rotulo[1], p.nome).toBeLessThanOrEqual(y + h + 0.01);
    }
  });

  it('o marcador de um prédio em U fica dentro dele, não no vão do meio', () => {
    const u = 'M0 0L100 0L100 100L70 100L70 30L30 30L30 100L0 100Z';
    expect(contem(u, 50, 50)).toBe(false);
    const [x, y] = pontoDentro(u, [0, 0, 100, 100]);
    expect(contem(u, x, y)).toBe(true);
  });

  it('num retângulo, o marcador fica no meio da caixa, como antes', () => {
    expect(pontoDentro('M10 20L50 20L50 40L10 40Z', [10, 20, 40, 20])).toEqual([30, 30]);
  });

  it('todo prédio do mapa tem o marcador dentro do próprio contorno', () => {
    for (const p of PREDIOS) {
      const [x, y] = pontoDentro(p.d, p.caixa);
      expect(contem(p.d, x, y), p.nome).toBe(true);
    }
  });
});
