import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MapaResumo, enquadrar } from './MapaResumo';
import { ALTURA_DO_CAMPUS, LARGURA_DO_CAMPUS, PREDIOS } from './predios';
import type { MarcadorDoBloco } from './urgencia';

const marcador = (predio: number | undefined, cor = '#d0443b'): MarcadorDoBloco => ({
  slug: `b${String(predio)}`,
  nome: 'Bloco',
  predio,
  abertas: 1,
  cor,
  urgente: false,
  linha: '',
  pautas: [],
});

describe('enquadrar', () => {
  it('sem prédio aceso, mostra o campus inteiro', () => {
    expect(enquadrar([])).toEqual({ x: 0, y: 0, w: LARGURA_DO_CAMPUS, h: ALTURA_DO_CAMPUS });
    expect(enquadrar([987654321])).toEqual({
      x: 0,
      y: 0,
      w: LARGURA_DO_CAMPUS,
      h: ALTURA_DO_CAMPUS,
    });
  });

  it('com um prédio aceso, enquadra com folga e na proporção do campus', () => {
    const quadro = enquadrar([PREDIOS[0]?.id ?? 0]);
    expect(quadro.w / quadro.h).toBeCloseTo(LARGURA_DO_CAMPUS / ALTURA_DO_CAMPUS, 5);
    const [x = 0, y = 0, w = 0, h = 0] = PREDIOS[0]?.caixa ?? [];
    expect(quadro.x).toBeLessThan(x);
    expect(quadro.y).toBeLessThan(y);
    expect(quadro.x + quadro.w).toBeGreaterThan(x + w);
    expect(quadro.y + quadro.h).toBeGreaterThan(y + h);
  });

  it('vários prédios cabem todos no quadro', () => {
    const escolhidos = PREDIOS.slice(0, 3);
    const quadro = enquadrar(escolhidos.map((p) => p.id));
    for (const p of escolhidos) {
      const [x = 0, y = 0, w = 0, h = 0] = p.caixa;
      expect(quadro.x).toBeLessThanOrEqual(x);
      expect(quadro.y).toBeLessThanOrEqual(y);
      expect(quadro.x + quadro.w).toBeGreaterThanOrEqual(x + w);
      expect(quadro.y + quadro.h).toBeGreaterThanOrEqual(y + h);
    }
  });
});

describe('MapaResumo', () => {
  it('é decorativo para o leitor de tela e acende o prédio com pauta, na cor da mais urgente', () => {
    const id = PREDIOS[0]?.id ?? 0;
    const html = renderToStaticMarkup(<MapaResumo marcadores={[marcador(id, '#ffa41b')]} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('fill:#ffa41b');
  });

  it('bloco sem prédio não acende nada', () => {
    const html = renderToStaticMarkup(<MapaResumo marcadores={[marcador(undefined)]} />);
    expect(html).not.toContain('fill:#d0443b');
  });
});
