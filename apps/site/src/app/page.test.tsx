import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buscarApoiosPorSemana, buscarBlocos, buscarConquistas, buscarPautas } from '../dados/api';
import exemplo from '../dados/blocos-teste.json';
import { PAUTAS_TESTE } from '../dados/pautas-teste';
import Home from './page';

// Os filtros usam o router do Next, que não existe fora do app: aqui só o que eles recebem importa.
vi.mock('../componentes/inicio/FiltrosDoInicio', () => ({
  EtapasFiltraveis: ({ linhas, atual }: { linhas: unknown; atual: unknown }) =>
    createElement('pre', { id: 'etapas' }, JSON.stringify({ linhas, atual })),
  BlocosFiltraveis: ({ linhas, atual }: { linhas: unknown; atual: unknown }) =>
    createElement('pre', { id: 'blocos' }, JSON.stringify({ linhas, atual })),
}));
vi.mock('../dados/api', () => ({
  buscarApoiosPorSemana: vi.fn(),
  buscarBlocos: vi.fn(),
  buscarConquistas: vi.fn(),
  buscarPautas: vi.fn(),
}));

const render = async (params: { bloco?: string; status?: string } = {}) =>
  renderToStaticMarkup(await Home({ searchParams: Promise.resolve(params) }));

/** O JSON que o filtro de teste recebeu, sem o escape do HTML. */
const recebido = (html: string, id: 'etapas' | 'blocos') =>
  JSON.parse(
    new RegExp(`<pre id="${id}">(.*?)</pre>`).exec(html.replaceAll('&quot;', '"'))?.[1] ?? '{}',
  ) as {
    linhas: { status?: string; slug?: string }[];
    atual: { status: string[]; bloco: string[] };
  };

describe('início', () => {
  beforeEach(() => {
    vi.mocked(buscarBlocos).mockResolvedValue(exemplo.blocos);
    vi.mocked(buscarPautas).mockResolvedValue(PAUTAS_TESTE as never);
    vi.mocked(buscarApoiosPorSemana).mockResolvedValue([]);
    vi.mocked(buscarConquistas).mockResolvedValue([]);
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('mostra os quatro números do campus e o caminho para a lista', async () => {
    const html = await render();
    expect(html).toContain('O campus em números');
    for (const rotulo of ['Pautas abertas', 'Apoios', 'Em cobrança', 'Conquistas']) {
      expect(html).toContain(`<dt>${rotulo}</dt>`);
    }
    expect(html).toMatch(/<a [^>]*href="\/pautas"[^>]*>Ver as \d+ pautas<\/a>/);
    expect(html).toContain('Toque em etapas e blocos para filtrar as pautas.');
    expect(html).not.toContain('<article');
  });

  it('o skyline mostra as pautas como janelas, cada uma com título, etapa e apoios no nome', async () => {
    const html = await render();
    expect(html).toContain('Cada janela acesa é uma pauta. Toque numa para ver qual.');
    const pauta = PAUTAS_TESTE.find((p) => p.status === 'descumprida');
    expect(pauta).toBeDefined();
    expect(html).toMatch(
      new RegExp(`aria-label="${pauta?.titulo ?? ''}, Descumprida, \\d+ apoios?"`),
    );
  });

  it('filtros múltiplos na URL: chegam aos filtros, ao botão da lista e às etiquetas', async () => {
    const html = await render({ bloco: 'bloco-a,bloco-b', status: 'cobrando,prometido' });
    const etapas = recebido(html, 'etapas');
    expect(etapas.atual).toEqual({
      status: ['cobrando', 'prometido'],
      bloco: ['bloco-a', 'bloco-b'],
    });
    expect(html).toMatch(
      /href="\/pautas\?status=cobrando,prometido&amp;bloco=bloco-a,bloco-b"[^>]*>Ver as \d+ pautas filtradas</,
    );
    expect(html).toContain('aria-label="Tirar o filtro de etapa Cobrando"');
    expect(html).toContain('aria-label="Tirar o filtro de bloco Bloco A"');
    expect(html).not.toContain('Toque em etapas e blocos');
  });

  it('a legenda do skyline cita todos os blocos escolhidos, com e sem pauta', async () => {
    const html = await render({ bloco: 'bloco-a,bloco-e' });
    expect(html).toMatch(/Blocos? escolhidos?: Bloco A \(\d+ pautas?\)/);
  });

  it('bloco e etapa desconhecidos são ignorados', async () => {
    const html = await render({ bloco: 'nao-existe', status: 'em_curadoria' });
    expect(recebido(html, 'etapas').atual).toEqual({ status: [], bloco: [] });
  });

  it('as etapas contam as pautas do bloco escolhido, e só as que têm pauta (ou foram escolhidas)', async () => {
    const html = await render({ bloco: 'bloco-a' });
    const etapas = recebido(html, 'etapas').linhas;
    const doBlocoA = PAUTAS_TESTE.filter((p) => p.bloco_slug === 'bloco-a');
    expect(etapas.map((e) => e.status).sort()).toEqual(
      [...new Set(doBlocoA.map((p) => p.status))].sort(),
    );
  });

  it('um bloco escolhido fora dos mais ativos continua nas linhas, para dar para tirá-lo', async () => {
    vi.mocked(buscarPautas).mockResolvedValue([] as never);
    const html = await render({ bloco: 'bloco-a' });
    expect(recebido(html, 'blocos').linhas.map((l) => l.slug)).toEqual(['bloco-a']);
  });

  it('a raiz com filtro não chama a API de blocos mais de uma vez nem filtra na API', async () => {
    await render({ bloco: 'bloco-a' });
    expect(buscarPautas).toHaveBeenCalledWith();
    expect(buscarPautas).toHaveBeenCalledTimes(1);
  });

  it('erro da API sobe para o error.tsx em vez de renderizar a página vazia', async () => {
    vi.mocked(buscarPautas).mockRejectedValue(new Error('API de leitura respondeu 500'));
    await expect(render()).rejects.toThrow('500');
  });
});
