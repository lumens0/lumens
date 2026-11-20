import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Acessibilidade automática (4.8b, SCRUM-60): o axe roda nas 4 páginas do fluxo principal, nos
// dois tamanhos de tela do playwright.config.ts (celular e desktop). Critério de aceite: zero
// violações "serious" ou "critical". As "moderate" e "minor" não derrubam o CI, mas aparecem no
// relatório do axe quando alguém o roda à mão.
//
// Se este teste falhar: corrija a página. Não acrescente exceção aqui sem registrar na PR por quê.

const PAGINAS = [
  { nome: 'início', caminho: '/' },
  { nome: 'pautas', caminho: '/pautas' },
  // Pauta do seed com apoios, relatos e linha do tempo: a página mais cheia do site.
  { nome: 'pauta', caminho: '/p/bebedouros-no-bloco-18' },
  { nome: 'conquistas', caminho: '/conquistas' },
  { nome: 'atividade', caminho: '/atividade' },
];

/** As regras das WCAG 2.1 níveis A e AA, que são a referência da RNF09. */
const NORMAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const GRAVES = new Set(['serious', 'critical']);

for (const { nome, caminho } of PAGINAS) {
  test(`${nome}: nenhuma violação serious ou critical (axe)`, async ({ page }) => {
    // O axe mede o contraste na cor que está na tela: com um card no meio da animação de entrada
    // (opacidade parcial, inclusive a que se liga à rolagem), o texto parece claro demais. O CSS do
    // site já desliga as animações com "reduzir movimento"; o teste pede isso e mede o estado final.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(caminho);
    await expect(page.locator('main')).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withTags(NORMAS).analyze();

    // A mensagem de falha diz a regra, o que ela pede e onde está o problema, para não precisar
    // abrir o trace para saber o que corrigir.
    const graves = violations
      .filter((v) => v.impact != null && GRAVES.has(v.impact))
      .map((v) => ({
        regra: v.id,
        impacto: v.impact,
        problema: v.help,
        onde: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
      }));
    expect(graves).toEqual([]);
  });
}

// A folha "Escolher blocos" aberta é outra tela para o axe: diálogo modal, campo de busca e chips.
test('início com a folha "Escolher blocos" aberta: nenhuma violação serious ou critical (axe)', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Escolher entre os \d+ blocos$/ }).click();
  await expect(page.getByRole('dialog', { name: 'Escolher blocos' })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(NORMAS).analyze();
  const graves = violations
    .filter((v) => v.impact != null && GRAVES.has(v.impact))
    .map((v) => ({
      regra: v.id,
      problema: v.help,
      onde: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }));
  expect(graves).toEqual([]);
});
