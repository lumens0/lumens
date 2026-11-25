import { expect, test, type Page } from '@playwright/test';

// Dados do seed (packages/db/seed/data.ts): fixos. O mapa mostra as 7 pautas públicas em 6 blocos.
const BLOCO = 'Bloco 18 (fictício)';
const NOME_DO_BLOCO = new RegExp(BLOCO.replace(/[()]/g, String.raw`\$&`));

const viewBox = (page: Page) =>
  page.getByRole('application').locator('svg').getAttribute('viewBox');
const largura = async (page: Page) => Number((await viewBox(page))?.split(' ')[2]);

test('o mapa abre com todos os blocos acesos, os chips por etapa e a lista de blocos', async ({
  page,
}) => {
  await page.goto('/mapa');
  const chips = page.getByRole('group', { name: 'Mostrar no mapa' });
  await expect(chips.getByRole('button', { name: 'Tudo aceso' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Só as etapas que têm pauta aparecem como chip, cada uma com a contagem.
  await expect(chips.getByRole('button', { name: /Cobrando\s+1/ })).toBeVisible();
  await expect(chips.getByRole('button', { name: /Em curadoria/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Onde há pautas' })).toBeVisible();
  await expect(page.getByText('6 blocos acesos · 7 pautas')).toBeVisible();
  await expect(page.getByRole('application').locator('svg')).toHaveAttribute(
    'viewBox',
    /^-?[\d.]+ /,
  );
});

test('não há rolagem horizontal da página no mapa', async ({ page }) => {
  await page.goto('/mapa');
  const sobra = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(sobra).toBeLessThanOrEqual(0);
});

test.describe('interação com o mapa', () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 900,
    'a lista fica ao lado só no computador; no celular ela é a gaveta',
  );

  test('um chip de etapa filtra os blocos e a lista; "Tudo aceso" desfaz', async ({ page }) => {
    await page.goto('/mapa');
    const chips = page.getByRole('group', { name: 'Mostrar no mapa' });
    const cobrando = chips.getByRole('button', { name: /Cobrando/ });
    await cobrando.click();
    await expect(cobrando).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('1 bloco aceso · 1 pauta')).toBeVisible();
    await chips.getByRole('button', { name: 'Tudo aceso' }).click();
    await expect(page.getByText('6 blocos acesos · 7 pautas')).toBeVisible();
  });

  test('escolher um bloco na lista aproxima o mapa e mostra as pautas dele', async ({ page }) => {
    await page.goto('/mapa');
    // Espera o voo de entrada terminar antes de medir a largura de partida.
    await page.waitForTimeout(900);
    const antes = await largura(page);
    await page.getByRole('button', { name: NOME_DO_BLOCO }).click();
    await expect(page.getByRole('heading', { name: BLOCO })).toBeVisible();
    await expect(page.getByRole('button', { name: /Todos os blocos/ })).toBeVisible();
    await expect(page.getByText('Viu outro problema aqui?')).toBeVisible();
    // A câmera voa até o prédio: leva menos de um segundo e termina mais perto do que começou.
    await expect.poll(() => largura(page)).toBeLessThan(antes);
    // Cada pauta do bloco leva à própria página.
    await expect(page.locator('aside a[href^="/p/"]').first()).toBeVisible();
  });

  test('"Todos os blocos" volta à lista e ao enquadramento geral', async ({ page }) => {
    await page.goto('/mapa');
    await page.getByRole('button', { name: NOME_DO_BLOCO }).click();
    await page.getByRole('button', { name: /Todos os blocos/ }).click();
    await expect(page.getByRole('heading', { name: 'Onde há pautas' })).toBeVisible();
  });

  test('+ aproxima, − afasta e o botão de enquadrar volta a ver todos os blocos', async ({
    page,
  }) => {
    await page.goto('/mapa');
    await page.waitForTimeout(900);
    const inicial = await largura(page);
    await page.getByRole('button', { name: 'Aproximar' }).click();
    const perto = await largura(page);
    expect(perto).toBeLessThan(inicial);
    await page.getByRole('button', { name: 'Afastar' }).click();
    await page.getByRole('button', { name: 'Afastar' }).click();
    expect(await largura(page)).toBeGreaterThan(perto);
    await page.getByRole('button', { name: 'Ver todos os blocos com pautas' }).click();
    // O enquadramento volta ao geral (a largura pode diferir uns pixels do primeiro voo).
    await expect
      .poll(async () => Math.abs((await largura(page)) - inicial) / inicial)
      .toBeLessThan(0.03);
  });

  test('as setas movem a câmera e a tecla + aproxima, com o foco no mapa', async ({ page }) => {
    await page.goto('/mapa');
    await page.waitForTimeout(900);
    await page.getByRole('application', { name: /Mapa do campus/ }).focus();
    const antes = (await viewBox(page))?.split(' ').map(Number) ?? [];
    await page.keyboard.press('ArrowRight');
    const depois = (await viewBox(page))?.split(' ').map(Number) ?? [];
    expect(depois[0]).toBeGreaterThan(antes[0] ?? 0);
    expect(depois[2]).toBe(antes[2]);
    await page.keyboard.press('+');
    expect((await largura(page)) < (antes[2] ?? 0)).toBe(true);
  });

  test('arrastar com o botão esquerdo gira o mapa e N volta ao norte', async ({ page }) => {
    await page.goto('/mapa');
    await page.waitForTimeout(900);
    const palco = page.getByRole('application', { name: /Mapa do campus/ });
    const caixa = await palco.boundingBox();
    if (!caixa) throw new Error('mapa sem caixa');
    const x = caixa.x + 100;
    const y = caixa.y + caixa.height - 60;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 120, y, { steps: 6 });
    await page.mouse.up();
    const transform = () => page.locator('svg [data-mundo]').first().getAttribute('transform');
    expect(await transform()).not.toMatch(/^rotate\(0 /);
    await palco.focus();
    await page.keyboard.press('n');
    expect(await transform()).toMatch(/^rotate\(0 /);
  });

  test('Shift + arrastar leva a câmera no sentido contrário', async ({ page }) => {
    await page.goto('/mapa');
    await page.waitForTimeout(900);
    const palco = page.getByRole('application', { name: /Mapa do campus/ });
    const caixa = await palco.boundingBox();
    if (!caixa) throw new Error('mapa sem caixa');
    const antes = Number((await viewBox(page))?.split(' ')[0]);
    const x = caixa.x + 100;
    const y = caixa.y + caixa.height - 60;
    await page.keyboard.down('Shift');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 120, y, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const depois = Number((await viewBox(page))?.split(' ')[0]);
    expect(depois).toBeLessThan(antes);
  });

  test('Esc solta o bloco escolhido', async ({ page }) => {
    await page.goto('/mapa');
    await page.getByRole('button', { name: NOME_DO_BLOCO }).click();
    await expect(page.getByRole('heading', { name: BLOCO })).toBeVisible();
    await page.getByRole('application', { name: /Mapa do campus/ }).focus();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Onde há pautas' })).toBeVisible();
  });

  test('?bloco= abre o mapa já no bloco pedido', async ({ page }) => {
    await page.goto('/mapa?bloco=bloco-18');
    await expect(page.getByRole('heading', { name: BLOCO })).toBeVisible();
  });
});
