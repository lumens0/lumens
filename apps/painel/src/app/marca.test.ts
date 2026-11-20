import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const raiz = new URL('../../../../', import.meta.url);
const ler = (caminho: string) => readFileSync(new URL(caminho, raiz));

// O logo do painel é cópia do do site (SCRUM-285): se um mudar, o outro acompanha. As fontes
// deixaram de ser as mesmas no SCRUM-374: o site passou para a Geist, o painel ainda não.
describe('identidade igual à do site', () => {
  it.each([['apps/painel/public/lumens-marca.svg', 'apps/site/public/lumens-marca.svg']])(
    '%s é igual a %s',
    (painel, site) => {
      expect(ler(painel).equals(ler(site))).toBe(true);
    },
  );
});
