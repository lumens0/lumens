import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const raiz = new URL('../../../../', import.meta.url);
const ler = (caminho: string) => readFileSync(new URL(caminho, raiz));

// As fontes e o logo do painel são cópias dos do site (SCRUM-285): se um mudar, o outro acompanha.
describe('identidade igual à do site', () => {
  it.each([
    [
      'apps/painel/src/fontes/bricolage-grotesque-latin-600-800.woff2',
      'apps/site/src/fontes/bricolage-grotesque-latin-600-800.woff2',
    ],
    [
      'apps/painel/src/fontes/instrument-sans-latin-400-700.woff2',
      'apps/site/src/fontes/instrument-sans-latin-400-700.woff2',
    ],
    ['apps/painel/public/lumens-marca.svg', 'apps/site/public/lumens-marca.svg'],
  ])('%s é igual a %s', (painel, site) => {
    expect(ler(painel).equals(ler(site))).toBe(true);
  });
});
