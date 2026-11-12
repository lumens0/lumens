import { LIMITE_MAXIMO, type Pautas } from '@lumens/contratos';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { numeroDoBot } from '../src/whatsapp';

// Privacidade de ponta a ponta (4.8b, SCRUM-61, RNF01): varre o HTML de todas as páginas públicas
// do site e o JSON de todas as rotas da API de leitura atrás de telefone, e-mail ou campo de
// identidade. Complementa a varredura da API (`apps/backend/src/api/privacidade.test.ts`,
// SCRUM-89), que roda sobre um banco em memória: aqui é o site construído, servido pela API real,
// pelo login `lumens_site`, sobre as views — o caminho que um visitante percorre.
//
// O HTML é varrido cru, com o que o Next embute na página (o payload do React vai junto em
// <script>): um campo que vaze sem aparecer na tela também é vazamento.
//
// Se este teste falhar: NÃO relaxe os padrões — ache de onde o dado saiu e corrija a origem.

/** A API de leitura que o playwright.config.ts sobe para o site. */
const API = process.env.LUMENS_API_URL ?? 'http://127.0.0.1:3101';

/** Páginas fixas do site; as das pautas saem da própria API, para nenhuma ficar de fora. */
const PAGINAS_FIXAS = ['/', '/conquistas', '/atividade', '/privacidade', '/mapa'];

/** Todas as rotas GET da API de leitura (`apps/backend/src/api/routes.ts`). */
const ROTAS_DA_API = ['/resumo', '/blocos', '/pautas', '/conquistas', '/atividade'];

/**
 * Os mesmos padrões da varredura da API, com uma diferença: no HTML cru aparecem números longos
 * (instantes em milissegundos, ids do Next), e o telefone sem borda casaria dentro deles. Por isso
 * aqui ele não pode encostar em outro dígito. O código do país (`+55`/`55`) é opcional e entra na
 * correspondência, senão a borda esconderia o número internacional compacto (`5582999990001`). O 9
 * do celular continua obrigatório: é o que segura o falso positivo com data, valor e uuid.
 */
const PADROES: readonly (readonly [string, RegExp])[] = [
  ['telefone', /(?<![\d])(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9\d{4}[-\s]?\d{4}(?![\d])/g],
  // Domínio com letras no fim: "logo@2x.png" e "@media" não são e-mail.
  [
    'e-mail',
    /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.(?!png\b|jpe?g\b|svg\b|webp\b|css\b|js\b)[a-z]{2,}\b/gi,
  ],
];

/**
 * Nome de campo de identidade, como chave de JSON. Aparece também escapado (\"telefone\":)
 * dentro do payload do React no HTML. O texto da página de privacidade fala em "telefone" e
 * "e-mail" à vontade: só a chave seguida de dois-pontos conta.
 */
const CAMPO_DE_IDENTIDADE =
  /\\?"(telefone\w*|e-?mail\w*|\w*_hmac|\w*_cifrado|estudante_?id)\\?"\s*:/gi;

/**
 * O número do bot aparece de propósito nos links do WhatsApp (4.3). Não é dado de ninguém. Só os
 * dígitos, como o site gera o link: a variável pode vir com máscara (`+55 82 99999-9999`).
 */
export function numerosPermitidos(bot: string | undefined): ReadonlySet<string> {
  return new Set([numeroDoBot(bot) || '5500000000000']);
}

const PERMITIDOS = numerosPermitidos(process.env.NEXT_PUBLIC_WHATSAPP_BOT);

/**
 * Tudo o que parece dado pessoal num texto. Separada do `expect` de propósito: é ela que o teste
 * do teste, no fim do arquivo, exercita com um vazamento plantado.
 */
export function acharDadoPessoal(
  texto: string,
  permitidos: ReadonlySet<string> = PERMITIDOS,
): string[] {
  const achados: string[] = [];
  for (const [nome, padrao] of PADROES) {
    for (const casa of texto.matchAll(padrao)) {
      const valor = casa[0];
      if (!permitidos.has(valor.replace(/\D/g, ''))) achados.push(`${nome}: ${valor}`);
    }
  }
  for (const casa of texto.matchAll(CAMPO_DE_IDENTIDADE)) {
    achados.push(`campo de identidade: ${casa[1] ?? casa[0]}`);
  }
  return achados;
}

/**
 * O corpo de uma rota pública da API. Todas as varridas são GETs públicos com parâmetros válidos:
 * qualquer status que não seja 200 falha aqui, porque varrer só a mensagem de erro deixaria o
 * teste verde sem olhar dado nenhum.
 */
async function corpoDaRota(request: APIRequestContext, rota: string): Promise<string> {
  const resposta = await request.get(`${API}${rota}`);
  if (resposta.status() !== 200) {
    throw new Error(`${rota} respondeu ${String(resposta.status())}; a varredura exige 200`);
  }
  return resposta.text();
}

/** Os slugs de todas as pautas públicas, página por página da API. */
async function slugsPublicos(request: APIRequestContext): Promise<string[]> {
  const slugs: string[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const resposta = await request.get(
      `${API}/pautas?limit=${String(LIMITE_MAXIMO)}&offset=${String(offset)}`,
    );
    expect(resposta.ok()).toBe(true);
    const pagina = (await resposta.json()) as Pautas;
    slugs.push(...pagina.itens.map((p) => p.slug));
    offset = pagina.proximo;
  }
  return slugs;
}

/** Uma vez basta: o HTML e a API não mudam com o tamanho da tela. */
function soNoDesktop() {
  test.skip(test.info().project.name !== 'desktop', 'roda só no projeto desktop');
}

test.describe('nenhuma página ou rota pública mostra dado pessoal (RNF01)', () => {
  test.beforeEach(soNoDesktop);

  test('o HTML de todas as páginas públicas, inclusive cada pauta', async ({ page, request }) => {
    const slugs = await slugsPublicos(request);
    // Sem pauta nenhuma, o teste passaria varrendo quase nada.
    expect(slugs.length).toBeGreaterThan(3);

    const vazamentos: string[] = [];
    for (const caminho of [...PAGINAS_FIXAS, ...slugs.map((s) => `/p/${s}`)]) {
      const resposta = await page.goto(caminho);
      expect(resposta?.status(), caminho).toBe(200);
      const html = await page.content();
      vazamentos.push(...acharDadoPessoal(html).map((a) => `${caminho} → ${a}`));
    }
    expect(vazamentos).toEqual([]);
  });

  test('o JSON de todas as rotas da API, inclusive o detalhe de cada pauta', async ({
    request,
  }) => {
    const slugs = await slugsPublicos(request);
    const rotas = [
      ...ROTAS_DA_API.flatMap((r) => [r, `${r}?limit=${String(LIMITE_MAXIMO)}`]),
      ...slugs.map((s) => `/pautas/${s}`),
    ];

    const vazamentos: string[] = [];
    for (const rota of rotas) {
      const corpo = await corpoDaRota(request, rota);
      vazamentos.push(...acharDadoPessoal(corpo).map((a) => `${rota} → ${a}`));
    }
    expect(vazamentos).toEqual([]);
  });

  test('uma rota que responde erro reprova a varredura em vez de passar vazia', async ({
    request,
  }) => {
    await expect(corpoDaRota(request, '/pautas/pauta-que-nao-existe')).rejects.toThrow(
      'respondeu 404',
    );
    await expect(corpoDaRota(request, '/pautas?limit=abc')).rejects.toThrow('respondeu 400');
  });
});

// O teste do teste: a varredura acusa o que precisa acusar e deixa passar o que é legítimo. Sem
// isto, um padrão quebrado passaria em silêncio pelos testes de cima, sempre verdes.
test.describe('a varredura acusa um vazamento plantado', () => {
  test.beforeEach(soNoDesktop);

  const VAZAMENTOS: readonly (readonly [string, string, string])[] = [
    ['e-mail num relato', '<p>Falar com fulano.tal@ufal.br sobre isso</p>', 'e-mail'],
    ['celular com DDD', '<p>Liga pra (82) 99999-1234</p>', 'telefone'],
    ['celular colado', '<p>whats 82999991234</p>', 'telefone'],
    ['celular com +55', '<p>meu zap +5582999990001</p>', 'telefone'],
    ['celular com 55', '{"texto":"chama no 5582999990001"}', 'telefone'],
    ['celular com +55 e espaços', '<p>+55 (82) 99999-1234</p>', 'telefone'],
    [
      'campo no payload do React',
      '<script>self.__next_f.push([1,"{\\"telefone\\":\\"x\\"}"])</script>',
      'campo',
    ],
    ['campo em JSON', '{"pauta":{"email_hmac":"abc"}}', 'campo'],
  ];
  for (const [caso, texto, tipo] of VAZAMENTOS) {
    test(`acusa ${caso}`, () => {
      expect(acharDadoPessoal(texto).join(' | ')).toContain(tipo);
    });
  }

  const LEGITIMOS: readonly (readonly [string, string])[] = [
    ['instante em milissegundos', '{"t":1794500002000}'],
    ['uuid', '{"id":"5e971e1a-0000-4000-8000-000000000001"}'],
    ['imagem retina', '<img src="/logo@2x.png">'],
    ['regra de CSS', '<style>@media (min-width: 600px){}</style>'],
    ['domínio sem nome de pessoa', '<p>e-mail institucional (@ufal.br)</p>'],
    ['texto que fala de telefone', '<p>Seu telefone e seu e-mail são cifrados.</p>'],
    ['número do bot', '<a href="https://wa.me/5500000000000">Apoiar</a>'],
  ];
  for (const [caso, texto] of LEGITIMOS) {
    test(`deixa passar ${caso}`, () => {
      expect(acharDadoPessoal(texto)).toEqual([]);
    });
  }

  test('deixa passar o número do bot configurado com máscara', () => {
    const permitidos = numerosPermitidos('+55 82 99999-9999');
    const link = '<a href="https://wa.me/5582999999999?text=apoiar">Apoiar</a>';
    expect(acharDadoPessoal(link, permitidos)).toEqual([]);
    // Outro número continua acusado.
    expect(acharDadoPessoal('<p>5582988887777</p>', permitidos).join(' | ')).toContain('telefone');
  });
});
