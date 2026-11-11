import { describe, expect, it } from 'vitest';
import {
  aproximar,
  cobrir,
  desviar,
  girar,
  limitar,
  matrizDaCamada,
  normalizar,
  ZOOM_MINIMO,
  type Visao,
} from './camera';
import { ALTURA_DO_CAMPUS, LARGURA_DO_CAMPUS } from './predios';

const base = { x: 400, y: 300, w: 800, h: 600 };

describe('câmera do mapa', () => {
  it('cobrir aumenta a visão até a proporção da tela, sem cortar nem deslocar o alvo', () => {
    // Tela em pé (celular): cresce na altura.
    expect(cobrir(base, 0.5)).toEqual({ x: 400, y: -200, w: 800, h: 1600 });
    // Tela deitada: cresce na largura.
    expect(cobrir(base, 2)).toEqual({ x: 200, y: 300, w: 1200, h: 600 });
  });

  /** Onde um ponto do desenho cai na tela: primeiro a camada, depois o encaixe do viewBox. */
  const naTela = (v: Visao, giro: number, largura: number, altura: number) => {
    const [a, b, c, d, e, f] = matrizDaCamada(base, v, largura, altura, giro);
    const m = Math.min(largura / base.w, altura / base.h);
    return (x: number, y: number) => [
      m * (a * x + c * y + e - base.x) + (largura - base.w * m) / 2,
      m * (b * x + d * y + f - base.y) + (altura - base.h * m) / 2,
    ];
  };

  it('a visão de abertura não precisa de transform: a camada fica na identidade', () => {
    for (const [largura, altura] of [
      [375, 560],
      [1280, 656],
    ] as const) {
      const matriz = matrizDaCamada(base, cobrir(base, largura / altura), largura, altura);
      [1, 0, 0, 1, 0, 0].forEach((esperado, i) => {
        expect(matriz[i]).toBeCloseTo(esperado);
      });
    }
  });

  it('a matriz leva o canto da visão ao canto da tela', () => {
    const [largura, altura] = [1000, 500];
    const v = { x: 900, y: 700, w: 200, h: 100 };
    const ponto = naTela(v, 0, largura, altura);
    const [x0, y0] = ponto(v.x, v.y);
    const [x1, y1] = ponto(v.x + v.w, v.y + v.h);
    expect(x0).toBeCloseTo(0);
    expect(y0).toBeCloseTo(0);
    expect(x1).toBeCloseTo(largura);
    expect(y1).toBeCloseTo(altura);
  });

  it('girado, o centro da visão continua no centro da tela', () => {
    const [largura, altura] = [1000, 500];
    const v = { x: 900, y: 700, w: 200, h: 100 };
    const [x, y] = naTela(v, 1.2, largura, altura)(v.x + v.w / 2, v.y + v.h / 2);
    expect(x).toBeCloseTo(largura / 2);
    expect(y).toBeCloseTo(altura / 2);
  });

  it('girar e aproximar com o mapa girado mantêm parado o ponto debaixo dos dedos', () => {
    const [largura, altura] = [1000, 500];
    const v = { x: 600, y: 500, w: 800, h: 400 };
    const [giro, px, py] = [0.7, 0.2, 0.9];
    const antes = naTela(v, giro, largura, altura);
    const girada = girar(v, giro, 0.5, px, py);
    const depois = naTela(girada, giro + 0.5, largura, altura);
    const perto = aproximar(v, 0.5, px, py, giro);
    const comZoom = naTela(perto, giro, largura, altura);
    for (const [x, y] of [
      [950, 720],
      [1010, 790],
    ] as const) {
      const [ax, ay] = antes(x, y);
      const [bx, by] = depois(x, y);
      const [cx, cy] = comZoom(x, y);
      // A distância de qualquer ponto até o dedo não muda ao girar, e dobra ao aproximar 2x.
      const dedo = [px * largura, py * altura] as const;
      const dist = (qx = 0, qy = 0) => Math.hypot(qx - dedo[0], qy - dedo[1]);
      expect(dist(bx, by)).toBeCloseTo(dist(ax, ay));
      expect(dist(cx, cy)).toBeCloseTo(2 * dist(ax, ay));
    }
  });

  it('o prédio focado fica à esquerda do centro da tela em qualquer giro (painel à direita)', () => {
    const [largura, altura] = [800, 500];
    const alvo = { x: 900, y: 700, w: 420, h: 300 };
    const centro = [alvo.x + alvo.w / 2, alvo.y + alvo.h / 2] as const;
    for (const giro of [0, Math.PI / 2, Math.PI, -Math.PI / 6]) {
      const v = cobrir(desviar(alvo, 0.18, giro), largura / altura);
      const [x, y] = naTela(v, giro, largura, altura)(...centro);
      // 18% da largura do alvo, na escala da tela, à esquerda do meio; a altura não muda.
      expect(x).toBeCloseTo(largura / 2 - 0.18 * alvo.w * (largura / v.w));
      expect(y).toBeCloseTo(altura / 2);
    }
  });

  it('normalizar devolve o ângulo equivalente mais perto do norte', () => {
    expect(normalizar(2 * Math.PI + 0.3)).toBeCloseTo(0.3);
    expect(normalizar(-2 * Math.PI - 0.3)).toBeCloseTo(-0.3);
    expect(normalizar(Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2);
  });

  it('aproximar mantém parado o ponto debaixo do dedo e respeita o zoom mínimo', () => {
    const v = aproximar(base, 0.5, 0.25, 0.75);
    expect(v.w).toBe(400);
    expect(v.x + 0.25 * v.w).toBeCloseTo(base.x + 0.25 * base.w);
    expect(v.y + 0.75 * v.h).toBeCloseTo(base.y + 0.75 * base.h);
    expect(aproximar(base, 0.001, 0.5, 0.5).w).toBe(ZOOM_MINIMO);
  });

  it('limitar não deixa o centro da tela sair do campus', () => {
    const longe = limitar({ x: -5000, y: 9000, w: 400, h: 300 });
    expect(longe.x + longe.w / 2).toBe(0);
    expect(longe.y + longe.h / 2).toBe(ALTURA_DO_CAMPUS);
    const dentro = { x: LARGURA_DO_CAMPUS / 2, y: 100, w: 400, h: 300 };
    expect(limitar(dentro)).toEqual(dentro);
  });
});
