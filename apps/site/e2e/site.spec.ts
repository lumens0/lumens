import { expect, test } from '@playwright/test';

// Dados do seed da Parte 1 (packages/db/seed/data.ts): fixos, não mudam entre execuções.
const PAUTA = { slug: 'bebedouros-no-bloco-18', titulo: 'Bebedouros funcionando no Bloco 18' };
const EM_CURADORIA = 'mais-arvores-no-campus';
const BLOCO = { slug: 'bloco-18', nome: 'Bloco 18 (fictício)' };
// Totais do seed: o campus inteiro e só o Bloco 18 (as pautas em curadoria e recusadas ficam de fora).
const TOTAL_DE_PAUTAS = 7;
const TOTAIS_DO_BLOCO = { cards: 2 };
// Número fictício do build do CI (NEXT_PUBLIC_WHATSAPP_BOT).
const NUMERO_DO_BOT = '5500000000000';

// Os quatro números do Início, no campus todo (seed: 4 abertas, 978 apoios, 4 em cobrança, 1 conquista).
const NUMEROS_DO_INICIO = ['4', '978', '4', '1'];

test('o Início mostra os quatro números do campus', async ({ page }) => {
  await page.goto('/');
  const numeros = page.getByRole('region', { name: 'O campus em números' });
  await expect(numeros.locator('dt')).toHaveText([
    'Pautas abertas',
    'Apoios',
    'Em cobrança',
    'Conquistas',
  ]);
  // Cada número aparece duas vezes no <dd>: o animado, escondido do leitor de tela, e o valor final
  // em texto oculto, que é o que o leitor lê (SCRUM-306). Os dois têm de chegar ao total.
  await expect(numeros.locator('dd > span > [aria-hidden="true"]')).toHaveText(NUMEROS_DO_INICIO);
  await expect(numeros.locator('dd > span > :not([aria-hidden])')).toHaveText(NUMEROS_DO_INICIO);
});

test('a lista de pautas carrega, com uma busca só', async ({ page }) => {
  await page.goto('/pautas');
  await expect(page.getByRole('article')).toHaveCount(TOTAL_DE_PAUTAS);
  await expect(page.getByRole('searchbox')).toHaveCount(1);
  await expect(page.getByRole('link', { name: PAUTA.titulo, exact: true })).toBeVisible();
  // Pauta em curadoria nunca aparece na lista.
  await expect(page.locator(`a[href="/p/${EM_CURADORIA}"]`)).toHaveCount(0);
});

test('buscar o nome de um bloco oferece o filtro por ele e a lista fica só com as pautas dele', async ({
  page,
}) => {
  await page.goto('/pautas');
  await page.getByRole('searchbox').fill('Bloco 18');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('link', { name: `Filtrar pelo bloco: ${BLOCO.nome}` }).click();
  await expect(page).toHaveURL(`/pautas?bloco=${BLOCO.slug}`);
  await expect(page.getByRole('article')).toHaveCount(TOTAIS_DO_BLOCO.cards);
  for (const card of await page.getByRole('article').all()) {
    await expect(card).toContainText(BLOCO.nome);
  }
});

test('os chips de etapa filtram a lista e vão para a URL', async ({ page }) => {
  await page.goto('/pautas');
  await page.getByRole('button', { name: /^Cobrando/ }).click();
  await expect(page).toHaveURL(/status=cobrando/);
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('link', { name: 'Tirar o filtro de etapa Cobrando' }).click();
  await expect(page.getByRole('article')).toHaveCount(TOTAL_DE_PAUTAS);
});

test('a ordenação muda a URL e a ordem da lista', async ({ page }) => {
  await page.goto('/pautas');
  await page.getByRole('combobox', { name: 'Ordenar por' }).selectOption('apoios');
  await expect(page).toHaveURL(/ordem=apoios/);
  const apoios = await page.locator('article [class*=apoios]').allTextContents();
  const numeros = apoios.map((t) => Number(t.replace(/D/g, '')));
  expect(numeros).toEqual([...numeros].sort((a, b) => b - a));
});

test('abrir uma pauta pela lista', async ({ page }) => {
  await page.goto('/pautas');
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
// O seed tem 25 eventos públicos (o mesmo que `apps/backend/src/api/api.test.ts` confere): 20 na
// primeira página e 5 na segunda. O mais novo é a entrega em parte da pauta da acessibilidade.
// Banco local onde o agendador já rodou tem eventos a mais: rode sobre um seed novo.
const ATIVIDADE = {
  primeira: 20,
  segunda: 5,
  maisNova: { rotulo: 'Status alterado', slug: 'acessibilidade-no-bloco-18' },
  tituloMaisNova: 'Acessibilidade nas entradas do Bloco 18',
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
  await expect(
    page.getByRole('heading', { level: 1, name: 'O que os estudantes já conquistaram' }),
  ).toBeVisible();
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
  await expect(itens.first()).toContainText(ATIVIDADE.tituloMaisNova);
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

// SCRUM-338: robots e sitemap respondem, e o sitemap traz as pautas do seed.
test('robots.txt e sitemap.xml respondem 200', async ({ request }) => {
  expect((await request.get('/robots.txt')).status()).toBe(200);
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain(`/p/${PAUTA.slug}</loc>`);
});

// SCRUM-379: a resposta renderizada (não só a config) sai com o cache curto da CDN, e o filtro de
// bloco entra na URL, então cada filtro é uma entrada própria. Na Vercel o `Cache-Control` do Next
// é reescrito; o `Vercel-CDN-Cache-Control` é o que vale lá, e some antes de chegar ao navegador.
test.describe('cache das páginas públicas', () => {
  for (const caminho of [
    '/',
    '/pautas',
    '/pautas?bloco=bloco-18',
    '/mapa',
    '/conquistas',
    '/atividade',
  ]) {
    test(`${caminho} responde com cache curto`, async ({ request }) => {
      const resposta = await request.get(caminho);
      expect(resposta.status()).toBe(200);
      expect(resposta.headers()['cache-control']).toContain('s-maxage=5');
      expect(resposta.headers()['cache-control']).not.toContain('no-store');
    });
  }
});

// Etapas e blocos do Início são filtros de seleção múltipla, guardados na URL.
test('o Início filtra por etapas e blocos na URL e leva os filtros para /pautas', async ({
  page,
}) => {
  await page.goto('/');
  const etapas = page.getByRole('region', { name: 'Em que etapa estão' });
  const blocos = page.getByRole('region', { name: 'Blocos mais ativos' });
  await etapas.getByRole('button', { name: /^Cobrando/ }).click();
  await expect(page).toHaveURL(/status=cobrando/);
  await blocos.getByRole('button').first().click();
  await expect(page).toHaveURL(/status=cobrando&bloco=/);
  await expect(etapas.getByRole('button', { name: /^Cobrando/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('link', { name: /pautas? filtradas?$/ }).click();
  await expect(page).toHaveURL(/\/pautas\?status=cobrando&bloco=/);
});

test('uma janela do skyline mostra a pauta na legenda, com o caminho até ela', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: new RegExp(`^${PAUTA.titulo}, `) })
    .first()
    .click();
  await expect(page.getByRole('link', { name: 'Abrir pauta' })).toHaveAttribute(
    'href',
    `/p/${PAUTA.slug}`,
  );
});

test('as abas Início e Pautas levam cada uma à sua página', async ({ page }) => {
  await page.goto('/');
  const abas = page.getByRole('navigation', { name: 'Seções do site' });
  await expect(abas.getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page');
  await abas.getByRole('link', { name: 'Pautas' }).click();
  await expect(page).toHaveURL('/pautas');
  await expect(abas.getByRole('link', { name: 'Pautas' })).toHaveAttribute('aria-current', 'page');
});

// Folha "Escolher blocos": pelo menos um bloco, e ✕, Esc e o clique fora cancelam sem filtrar.
test.describe('folha "Escolher blocos"', () => {
  const abrir = async (page: import('@playwright/test').Page) => {
    await page.goto('/');
    const gatilho = page.getByRole('button', { name: /^Escolher entre os \d+ blocos$/ });
    await gatilho.click();
    const folha = page.getByRole('dialog', { name: 'Escolher blocos' });
    await expect(folha).toBeVisible();
    return { gatilho, folha };
  };

  test('o botão final fica bloqueado sem escolha e libera com um bloco', async ({ page }) => {
    const { folha } = await abrir(page);
    const aplicar = folha.getByRole('button', { name: 'Escolha um bloco para continuar' });
    await expect(aplicar).toBeDisabled();
    await expect(folha.getByText('Escolha ao menos um bloco para filtrar.')).toBeVisible();
    await folha.getByRole('button', { name: BLOCO.nome }).click();
    await expect(folha.getByRole('button', { name: 'Filtrar por 1 bloco' })).toBeEnabled();
  });

  test('aplicar leva os blocos escolhidos para a URL', async ({ page }) => {
    const { folha } = await abrir(page);
    await folha.getByRole('button', { name: BLOCO.nome }).click();
    await folha.getByRole('button', { name: 'Filtrar por 1 bloco' }).click();
    await expect(page).toHaveURL(new RegExp(`bloco=${BLOCO.slug}`));
    await expect(folha).toBeHidden();
  });

  test('Esc cancela: não filtra e o foco volta ao botão que abriu', async ({ page }) => {
    const { gatilho, folha } = await abrir(page);
    await folha.getByRole('button', { name: BLOCO.nome }).click();
    await page.keyboard.press('Escape');
    await expect(folha).toBeHidden();
    await expect(page).toHaveURL('/');
    await expect(gatilho).toBeFocused();
  });

  test('a busca acha o bloco sem acento e sem diferenciar maiúsculas', async ({ page }) => {
    const { folha } = await abrir(page);
    await folha.getByRole('searchbox').fill('SAUDE');
    await expect(folha.getByRole('button', { name: /Saúde/ })).toBeVisible();
    await expect(folha.getByRole('button', { name: BLOCO.nome })).toBeHidden();
  });
});
