import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// O CSS não roda no vitest (sem navegador): estas asserções travam as regras de que o layout
// da curadoria depende (SCRUM-358), no desenho do protótipo. A conferência em 375/1280 px segue
// no roteiro manual.
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
    expect(regra('.decisoes')).toContain('grid-template-columns: max-content max-content 1fr');
    expect(regra('.aprovacao')).toContain('display: contents');
  });

  it('a largura dos botões de decisão não alcança o "Confirmar recusa"', () => {
    expect(css).not.toMatch(/\.decisoes button/);
    expect(css).toContain('.aprovacao > .botao');
  });

  it('aprovar e recusar relato ficam lado a lado numa grade só', () => {
    expect(regra('.acoesDoRelato')).toContain('grid-template-columns: max-content max-content 1fr');
    expect(regra('.emGrade')).toContain('display: contents');
  });

  it('abrir o motivo da recusa não tira o botão do lugar', () => {
    expect(css).toMatch(/\.decisoes > \.recusa\[open\] \{\s*grid-column: 2 \/ -1;/);
    expect(css).toMatch(/\.acoesDoRelato > \.recusa\[open\] \{\s*grid-column: 2 \/ -1;/);
  });

  it('o texto longo de Curadores não estoura a linha', () => {
    expect(regra('.curadorMeta')).toContain('overflow-wrap: anywhere');
  });

  it('o conteúdo segue o ritmo único das páginas e a largura do protótipo', () => {
    const conteudo = regra('.conteudo');
    expect(conteudo).toContain('var(--pagina-topo)');
    expect(conteudo).toContain('min(100% - 32px, 1080px)');
  });

  it('as abas do cabeçalho sublinham em âmbar a seção aberta', () => {
    expect(css).toContain('.navegacao a[aria-current]::after');
    expect(regra('.navegacao a[aria-current]::after')).toContain('background: var(--luz)');
  });

  it('o link das barras de status é tinta, sem sublinhado; só o rótulo sublinha no hover', () => {
    const base = regra('.barras a');
    expect(base).toContain('color: var(--tinta)');
    expect(base).toContain('text-decoration: none');
    expect(css).toContain('.barras a:hover .barrasRotulo span');
  });
});
