import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buscarBlocos, buscarPautas } from '../../dados/api';
import exemplo from '../../dados/blocos-teste.json';
import { PAUTAS_TESTE } from '../../dados/pautas-teste';
import type { Pauta } from '../../dados/tipos';
import Pautas from './page';

// Os controles usam o router do Next, que não existe fora do app: aqui só o que eles recebem importa.
vi.mock('../../componentes/lista/FiltrosDaLista', () => ({
  FiltrosDaLista: (props: {
    etapas: unknown;
    status: unknown;
    bloco: unknown;
    ordem: unknown;
    sugestoes: ReactNode;
    ativos: ReactNode;
  }) =>
    createElement(
      Fragment,
      null,
      createElement(
        'pre',
        { id: 'controles' },
        JSON.stringify({
          etapas: props.etapas,
          status: props.status,
          bloco: props.bloco,
          ordem: props.ordem,
        }),
      ),
      props.sugestoes,
      props.ativos,
    ),
}));
vi.mock('../../dados/api', () => ({ buscarBlocos: vi.fn(), buscarPautas: vi.fn() }));

type Parametros = Record<string, string>;
const render = async (params: Parametros = {}) =>
  renderToStaticMarkup(await Pautas({ searchParams: Promise.resolve(params) }));

const controles = (html: string) =>
  JSON.parse(
    /<pre id="controles">(.*?)<\/pre>/.exec(html.replaceAll('&quot;', '"'))?.[1] ?? '{}',
  ) as { etapas: Record<string, number>; status: string[]; bloco: string[]; ordem: string };

/** Quantas linhas da lista a página desenhou. */
const linhas = (html: string) => html.match(/aria-controls="linha-/g)?.length ?? 0;

/** N pautas de um mesmo bloco, com título e apoios distintos. */
const lote = (n: number, extra: Partial<Pauta> = {}): Pauta[] =>
  Array.from(
    { length: n },
    (_, i) =>
      ({
        ...PAUTAS_TESTE[2],
        slug: `lote-${String(i)}`,
        titulo: `Pauta do lote ${String(i + 1).padStart(2, '0')}`,
        apoios: 100 - i,
        status: 'juntando_apoios',
        ...extra,
      }) as Pauta,
  );

describe('/pautas', () => {
  beforeEach(() => {
    vi.mocked(buscarBlocos).mockResolvedValue(exemplo.blocos);
    vi.mocked(buscarPautas).mockResolvedValue(PAUTAS_TESTE as never);
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('tem o título com a contagem e o caminho para o painel de números', async () => {
    const html = await render();
    expect(html).toMatch(/<h1>Pautas <small[^>]*>\d+<\/small><\/h1>/);
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Ver o painel de números<\/a>/);
  });

  it('sem filtro, lista as pautas públicas, uma linha cada, sem as de curadoria', async () => {
    const html = await render();
    const publicas = PAUTAS_TESTE.filter((p) => !['em_curadoria', 'recusada'].includes(p.status));
    expect(linhas(html)).toBe(publicas.length);
    expect(html).not.toContain('Pauta de teste · em_curadoria');
    expect(html).toContain(
      `Mostrando 1 a ${String(publicas.length)} de ${String(publicas.length)} pautas`,
    );
  });

  it('a busca acha por título, bloco, etapa e "urgente"', async () => {
    vi.mocked(buscarPautas).mockResolvedValue([
      ...lote(2),
      ...lote(1, { slug: 'u', titulo: 'Goteira urgente', urgente: true, status: 'cobrando' }),
    ] as never);
    const titulos = async (q: string) =>
      [...(await render({ q })).matchAll(/class="[^"]*_titulo_[^"]*">([^<]*)</g)].map((m) => m[1]);
    expect(await titulos('goteira')).toEqual(['Goteira urgente']);
    expect(await titulos('cobrando')).toEqual(['Goteira urgente']);
    expect(await titulos('urgente')).toEqual(['Goteira urgente']);
    expect(await titulos('instituto computacao')).toHaveLength(3);
  });

  it('digitar o nome de um bloco oferece "Filtrar pelo bloco: X" (até 6)', async () => {
    const html = await render({ q: 'bloco' });
    expect(html).toContain('Filtrar pelo bloco:');
    const chips = html.match(/<a [^>]*class="[^"]*_chip_[^"]*"/g) ?? [];
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.length).toBeLessThanOrEqual(6);
  });

  it('paginação: 10 pautas dão 2 páginas, 8 na primeira, e "Mostrando 9 a 10 de 10" na segunda', async () => {
    vi.mocked(buscarPautas).mockResolvedValue(lote(10) as never);
    const primeira = await render();
    expect(linhas(primeira)).toBe(8);
    expect(primeira).toContain('Mostrando 1 a 8 de 10 pautas');
    expect(primeira).toContain('aria-label="Páginas da lista"');
    expect(primeira).toContain('aria-current="page" aria-label="Página 1"');
    const segunda = await render({ pagina: '2' });
    expect(linhas(segunda)).toBe(2);
    expect(segunda).toContain('Mostrando 9 a 10 de 10 pautas');
    expect(segunda).toContain('aria-current="page" aria-label="Página 2"');
  });

  it('página fora da faixa cai na última; sem mais de uma página não há paginação', async () => {
    vi.mocked(buscarPautas).mockResolvedValue(lote(10) as never);
    expect(await render({ pagina: '99' })).toContain('Mostrando 9 a 10 de 10 pautas');
    vi.mocked(buscarPautas).mockResolvedValue(lote(3) as never);
    const unica = await render();
    expect(unica).toContain('Mostrando 1 a 3 de 3 pautas');
    expect(unica).not.toContain('Próxima');
  });

  it('a paginação mantém busca, ordem e filtros nos links', async () => {
    vi.mocked(buscarPautas).mockResolvedValue(lote(10) as never);
    const html = await render({ q: 'lote', ordem: 'apoios' });
    expect(html).toContain('href="/pautas?q=lote&amp;ordem=apoios&amp;pagina=2"');
  });

  it('o padrão põe a urgente primeiro, e a linha urgente usa a classe própria, sem a do selo do card', async () => {
    vi.mocked(buscarPautas).mockResolvedValue([
      ...lote(3),
      ...lote(1, { slug: 'u', titulo: 'Mais urgente', urgente: true, apoios: 1 }),
    ] as never);
    const html = await render();
    expect(html.indexOf('Mais urgente')).toBeLessThan(html.indexOf('Pauta do lote 01'));
    expect(html).toMatch(/<li class="[^"]*urgente[^"]*"/);
    expect(html).toMatch(/_seloUrgente_[^"]*">Urgente</);
    expect(html).not.toMatch(/class="[^"]*\burg\b/);
  });

  it('cada linha é um botão que abre: título e apoios, etiquetas, categoria | bloco e o que abre', async () => {
    const html = await render();
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('_tags_');
    expect(html).toContain('_onde_');
    expect(html).toContain('Meta: ');
    expect(html).toContain('Ver a pauta');
  });

  it('o filtro de etapa e o de bloco entram na lista e nas etiquetas com "×"', async () => {
    vi.mocked(buscarPautas).mockResolvedValue([
      ...lote(2),
      ...lote(1, { slug: 'c', titulo: 'Em cobrança', status: 'cobrando' }),
    ] as never);
    const html = await render({ status: 'cobrando', bloco: 'ic' });
    expect(linhas(html)).toBe(1);
    expect(html).toContain('aria-label="Tirar o filtro de etapa Cobrando"');
    expect(html).toContain('Limpar tudo');
    expect(controles(html).status).toEqual(['cobrando']);
  });

  it('sem pauta na combinação, diz isso e oferece "Limpar filtros"', async () => {
    const html = await render({ status: 'conquistada', q: 'nada-disso' });
    expect(html).toContain('Nenhuma pauta nessa combinação.');
    expect(html).toContain('Limpar filtros');
    expect(linhas(html)).toBe(0);
  });

  it('bloco sem pauta resulta em lista vazia', async () => {
    const html = await render({ bloco: 'bloco-c' });
    expect(html).toContain('Nenhuma pauta nessa combinação.');
  });

  it('as contagens das etapas seguem os blocos e a busca, e a etapa escolhida só filtra a lista', async () => {
    vi.mocked(buscarPautas).mockResolvedValue([
      ...lote(2),
      ...lote(1, { slug: 'c', titulo: 'Em cobrança', status: 'cobrando' }),
    ] as never);
    const { etapas } = controles(await render({ status: 'cobrando' }));
    expect(etapas.juntando_apoios).toBe(2);
    expect(etapas.cobrando).toBe(1);
  });

  it('erro da API sobe para o error.tsx em vez de renderizar a página vazia', async () => {
    vi.mocked(buscarPautas).mockRejectedValue(new Error('API de leitura respondeu 500'));
    await expect(render()).rejects.toThrow('500');
  });
});
