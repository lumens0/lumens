import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// O CSS não roda no vitest (sem navegador): estas asserções travam o ritmo único das páginas.
// A medida em 375 e 1280 px segue na conferência manual da PR.
const raiz = join(__dirname, '..', '..', '..');
const ler = (caminho: string) => readFileSync(join(raiz, caminho), 'utf8');

const tokens = ler('packages/marca/src/tokens.css');

describe('ritmo das páginas', () => {
  it('define o topo e o fim da página, maiores a partir de 900 px', () => {
    expect(tokens).toMatch(/--pagina-topo:\s*24px/);
    expect(tokens).toMatch(/--pagina-fim:\s*40px/);
    const desktop = tokens.slice(tokens.indexOf('@media (min-width: 900px)'));
    expect(desktop).toMatch(/--pagina-topo:\s*28px/);
    expect(desktop).toMatch(/--pagina-fim:\s*48px/);
  });

  it.each([
    'apps/site/src/app/page.module.css',
    'apps/site/src/componentes/pauta/pauta.module.css',
    'apps/site/src/app/manual/page.module.css',
    'apps/site/src/app/privacidade/page.module.css',
    'apps/painel/src/app/painel.module.css',
  ])('%s usa os tokens no contêiner da página', (arquivo) => {
    const css = ler(arquivo);
    expect(css).toContain('var(--pagina-topo)');
    expect(css).toContain('var(--pagina-fim)');
  });

  it('as faixas de noite sobem exatamente o topo da página, sem número solto', () => {
    for (const arquivo of [
      'apps/site/src/app/page.module.css',
      'apps/site/src/componentes/pauta/pauta.module.css',
    ]) {
      expect(ler(arquivo)).toContain('margin: calc(-1 * var(--pagina-topo))');
    }
  });
});
