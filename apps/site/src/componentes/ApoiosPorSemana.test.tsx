import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ApoiosPorSemana } from './ApoiosPorSemana';

const SEMANAS = [
  '2026-09-28',
  '2026-10-05',
  '2026-10-12',
  '2026-10-19',
  '2026-10-26',
  '2026-11-02',
  '2026-11-09',
  '2026-11-16',
].map((semana, i) => ({ semana, apoios: [6, 9, 7, 12, 15, 11, 18, 9][i] ?? 0 }));

describe('ApoiosPorSemana', () => {
  it('desenha 8 barras com o valor escrito, esconde as barras e dá uma tabela ao leitor de tela', () => {
    const html = renderToStaticMarkup(<ApoiosPorSemana semanas={SEMANAS} />);
    expect(html).toContain('Apoios por semana');
    expect(html.match(/<em/g)).toHaveLength(8);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<caption>');
    expect(html).toContain('Esta semana');
    expect(html).toContain('agora');
    expect(html).toContain('Pico: 18 apoios');
  });

  it('sem apoios: só o convite, sem barras nem tabela', () => {
    const vazias = SEMANAS.map((s) => ({ ...s, apoios: 0 }));
    const html = renderToStaticMarkup(<ApoiosPorSemana semanas={vazias} />);
    expect(html).toContain('Ainda não há apoios');
    expect(html).not.toContain('<em');
    expect(html).not.toContain('<table');
  });
});
