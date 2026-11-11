import { expect, test } from '@playwright/test';

// Dados do seed da Parte 1 (packages/db/seed/data.ts): fixos, não mudam entre execuções.
const PAUTA = { slug: 'bebedouros-no-bloco-18', titulo: 'Bebedouros funcionando no Bloco 18' };
const EM_CURADORIA = 'mais-arvores-no-campus';
const BLOCO = { slug: 'bloco-18', nome: 'Bloco 18 (fictício)' };
// Número fictício do build do CI (NEXT_PUBLIC_WHATSAPP_BOT).
const NUMERO_DO_BOT = '5500000000000';

test('a lista carrega com os totais', async ({ page }) => {
  await page.goto('/');
  const totais = page.getByRole('region', { name: 'Todo o campus' });
  for (const rotulo of ['Pautas abertas', 'Apoios', 'Conquistas']) {
    await expect(totais.getByText(rotulo, { exact: true })).toBeVisible();
  }
  await expect(totais.locator('dd').first()).toHaveText(/^\d[\d.]*$/);
  await expect(page.getByRole('link', { name: PAUTA.titulo })).toBeVisible();
  // Pauta em curadoria nunca aparece na lista.
  await expect(page.locator(`a[href="/p/${EM_CURADORIA}"]`)).toHaveCount(0);
});

test('o filtro por bloco muda a URL e a lista', async ({ page }) => {
  await page.goto('/');
  const antes = await page.getByRole('article').count();
  await page.getByLabel('Bloco').selectOption(BLOCO.slug);
  await expect(page).toHaveURL(`/?bloco=${BLOCO.slug}`);
  await expect(page.getByRole('region', { name: BLOCO.nome })).toBeVisible();
  const cards = page.getByRole('article');
  const depois = await cards.count();
  expect(depois).toBeGreaterThan(0);
  expect(depois).toBeLessThan(antes);
  for (const card of await cards.all()) await expect(card).toContainText(BLOCO.nome);
});

test('abrir uma pauta pela lista', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: PAUTA.titulo }).click();
  await expect(page).toHaveURL(`/p/${PAUTA.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: PAUTA.titulo })).toBeVisible();
});

test('pauta em curadoria dá 404', async ({ page }) => {
  const resposta = await page.goto(`/p/${EM_CURADORIA}`);
  expect(resposta?.status()).toBe(404);
  await expect(page.getByText('Não encontramos essa pauta.')).toBeVisible();
});

test('o botão "Apoiar" monta o link wa.me certo', async ({ page }) => {
  await page.goto(`/p/${PAUTA.slug}`);
  const botao = page.getByRole('link', { name: `Apoiar a pauta ${PAUTA.titulo} pelo WhatsApp` });
  await expect(botao).toHaveAttribute(
    'href',
    `https://wa.me/${NUMERO_DO_BOT}?text=${encodeURIComponent(`apoiar ${PAUTA.slug}`)}`,
  );
});
