import { expect, test, type Page } from '@playwright/test';

// Dados do seed da Parte 1 (packages/db/seed/data.ts): fixos, não mudam entre execuções.
const PAUTA = { slug: 'bebedouros-no-bloco-18', titulo: 'Bebedouros funcionando no Bloco 18' };
const EM_CURADORIA = 'mais-arvores-no-campus';
const BLOCO = { slug: 'bloco-18', nome: 'Bloco 18 (fictício)' };
// Totais do seed: o campus inteiro e só o Bloco 18 (as pautas em curadoria e recusadas ficam de fora).
const TOTAIS_DO_CAMPUS = { abertas: '4', apoios: '978', conquistas: '1', cards: 7 };
const TOTAIS_DO_BLOCO = { abertas: '1', apoios: '196', conquistas: '0', cards: 2 };
// Número fictício do build do CI (NEXT_PUBLIC_WHATSAPP_BOT).
const NUMERO_DO_BOT = '5500000000000';

/** Confere os três números da faixa de totais e quantos cards a lista mostra. */
async function conferirTotais(
  page: Page,
  regiao: string,
  esperado: { abertas: string; apoios: string; conquistas: string; cards: number },
) {
  const totais = page.getByRole('region', { name: regiao });
  await expect(totais.locator('dt')).toHaveText(['Pautas abertas', 'Apoios', 'Conquistas']);
  await expect(totais.locator('dd')).toHaveText([
    esperado.abertas,
    esperado.apoios,
    esperado.conquistas,
  ]);
  await expect(page.getByRole('article')).toHaveCount(esperado.cards);
}

test('a lista carrega com os totais', async ({ page }) => {
  await page.goto('/');
  await conferirTotais(page, 'Todo o campus', TOTAIS_DO_CAMPUS);
  await expect(page.getByRole('link', { name: PAUTA.titulo, exact: true })).toBeVisible();
  // Pauta em curadoria nunca aparece na lista.
  await expect(page.locator(`a[href="/p/${EM_CURADORIA}"]`)).toHaveCount(0);
});

test('o filtro por bloco muda a URL e a lista', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Bloco' }).selectOption(BLOCO.slug);
  await expect(page).toHaveURL(`/?bloco=${BLOCO.slug}`);
  // Os totais acompanham o filtro: a faixa não pode continuar com os números do campus.
  await conferirTotais(page, BLOCO.nome, TOTAIS_DO_BLOCO);
  for (const card of await page.getByRole('article').all()) {
    await expect(card).toContainText(BLOCO.nome);
  }
});

test('abrir uma pauta pela lista', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: PAUTA.titulo, exact: true }).click();
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

// SCRUM-62: card, conquistas e atividade, também sobre o seed.
const CONQUISTA = {
  slug: 'laboratorios-abertos-nas-engenharias',
  titulo: 'Laboratórios de informática abertos no contraturno',
};
// O seed tem 26 eventos públicos: 20 na primeira página e 6 na segunda. O mais novo é a abertura
// da conferência da pauta da Saúde.
const ATIVIDADE = {
  primeira: 20,
  segunda: 6,
  maisNova: { rotulo: 'Conferência aberta', slug: 'sala-de-descanso-na-saude' },
  tituloMaisNova: 'Sala de descanso para estudantes da Saúde',
};

test('o card da pauta é um PNG de 1080 × 1920', async ({ request }) => {
  const resposta = await request.get(`/p/${PAUTA.slug}/card.png`);
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()['content-type']).toBe('image/png');
  // Cabeçalho IHDR do PNG: largura e altura em big-endian nos bytes 16 a 23.
  const png = await resposta.body();
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1920]);
});

test('conquistas lista a pauta conquistada e leva até ela', async ({ page }) => {
  await page.goto('/conquistas');
  await expect(page.getByRole('heading', { level: 1, name: 'Conquistas' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('link', { name: CONQUISTA.titulo, exact: true }).click();
  await expect(page).toHaveURL(`/p/${CONQUISTA.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: CONQUISTA.titulo })).toBeVisible();
});

test('atividade lista do mais novo ao mais antigo, pagina e leva até a pauta', async ({ page }) => {
  await page.goto('/atividade');
  const itens = page.getByRole('main').getByRole('listitem');
  await expect(itens).toHaveCount(ATIVIDADE.primeira);
  await expect(itens.first()).toContainText(ATIVIDADE.maisNova.rotulo);
  await expect(page.locator('a[rel="prev"]')).toHaveCount(0);

  const paginas = page.getByRole('navigation', { name: 'Páginas da atividade' });
  await paginas.getByRole('link', { name: 'Mais antigas →' }).click();
  await expect(page).toHaveURL('/atividade?pagina=2');
  await expect(itens).toHaveCount(ATIVIDADE.segunda);
  await expect(paginas.getByRole('link', { name: 'Mais antigas →' })).toHaveCount(0);

  await paginas.getByRole('link', { name: '← Mais recentes' }).click();
  await expect(page).toHaveURL('/atividade');
  await itens.first().getByRole('link', { name: ATIVIDADE.tituloMaisNova, exact: true }).click();
  await expect(page).toHaveURL(`/p/${ATIVIDADE.maisNova.slug}`);
});
