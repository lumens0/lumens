import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// O CSS não roda no vitest (sem navegador): estas asserções travam as regras de que o layout
// da curadoria depende (SCRUM-358). A conferência em 375/1280 px segue no roteiro manual.
const css = readFileSync(join(__dirname, 'painel.module.css'), 'utf8');

/** Corpo da primeira regra cujo seletor é exatamente `seletor`. */
function regra(seletor: string): string {
  const inicio = css.indexOf(`
${seletor} {`);
  expect(inicio, `regra ${seletor} ausente`).toBeGreaterThanOrEqual(0);
  const abre = css.indexOf('{', inicio);
  return css.slice(abre + 1, css.indexOf('}', abre));
}

describe('layout do painel (SCRUM-358)', () => {
  it('aprovar e recusar a pauta dividem a mesma grade', () => {
    expect(regra('.decisoes')).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(regra('.aprovacao')).toContain('display: contents');
  });

  it('a largura dos botões de decisão não alcança o "Confirmar recusa"', () => {
    expect(css).not.toMatch(/\.decisoes button/);
    expect(css).toContain('.aprovacao > button');
  });

  it('aprovar e recusar relato ficam lado a lado numa grade só', () => {
    expect(regra('.acoesDoRelato')).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
  });

  it('a data de Curadores não quebra nem estoura a coluna', () => {
    expect(regra('.curadorDesde')).toContain('white-space: nowrap');
    expect(css).toContain('minmax(9rem, max-content)');
  });

  it('o respiro entre blocos não dobra depois dos filtros', () => {
    expect(css).toContain(':not(.filtros, .filtros + *)');
  });
});
