import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STATUS_PUBLICOS } from '@lumens/contratos';
import { STATUS } from '../componentes/StatusPill';
import { buscarApoiosPorSemana, buscarBlocos, buscarPautas } from '../dados/api';
import exemplo from '../dados/blocos-teste.json';
import { PAUTAS_TESTE } from '../dados/pautas-teste';
import Home from './page';

// A folha de blocos usa o router do Next, que não existe fora do app: aqui só o que ela recebe importa.
vi.mock('../componentes/inicio/FolhaDeBlocos', () => ({
  FolhaDeBlocos: ({ atual }: { atual: unknown }) =>
    createElement('pre', { id: 'folha' }, JSON.stringify({ atual })),
}));
vi.mock('../dados/api', () => ({
  buscarApoiosPorSemana: vi.fn(),
  buscarBlocos: vi.fn(),
  buscarPautas: vi.fn(),
}));

const render = async (params: { bloco?: string; status?: string } = {}) =>
  renderToStaticMarkup(await Home({ searchParams: Promise.resolve(params) }));

const recebidoDaFolha = (html: string) =>
  JSON.parse(/<pre id="folha">(.*?)<\/pre>/.exec(html.replaceAll('&quot;', '"'))?.[1] ?? '{}') as {
    atual: { status: string[]; bloco: string[] };
  };

describe('início', () => {
  beforeEach(() => {
    vi.mocked(buscarBlocos).mockResolvedValue(exemplo.blocos);
    vi.mocked(buscarPautas).mockResolvedValue(PAUTAS_TESTE as never);
    vi.mocked(buscarApoiosPorSemana).mockResolvedValue([]);
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('mostra os três totais do campus, as pautas e o caminho para /pautas', async () => {
    const html = await render();
    expect(html).toContain('Todo o campus');
    for (const rotulo of ['Pautas abertas', 'Apoios', 'Conquistas']) {
      expect(html).toContain(`<dt>${rotulo}</dt>`);
    }
    expect(html).toContain('href="/pautas"');
    expect(html).toContain('<article');
  });

  it('filtros múltiplos na URL chegam à folha de blocos, às etiquetas e ao link para /pautas', async () => {
    const html = await render({ bloco: 'bloco-a,bloco-b', status: 'cobrando,prometido' });
    expect(recebidoDaFolha(html).atual).toEqual({
      status: ['cobrando', 'prometido'],
      bloco: ['bloco-a', 'bloco-b'],
    });
    expect(html).toContain('href="/pautas?status=cobrando,prometido&amp;bloco=bloco-a,bloco-b"');
    expect(html).toContain('aria-label="Tirar o filtro de etapa Cobrando"');
    expect(html).toContain('aria-label="Tirar o filtro de bloco Bloco A"');
  });

  it('bloco e etapa desconhecidos são ignorados', async () => {
    const html = await render({ bloco: 'nao-existe', status: 'em_curadoria' });
    expect(recebidoDaFolha(html).atual).toEqual({ status: [], bloco: [] });
  });

  it('a raiz com filtro busca todas as pautas uma vez só, sem filtrar na API', async () => {
    await render({ bloco: 'bloco-a' });
    expect(buscarPautas).toHaveBeenCalledWith();
    expect(buscarPautas).toHaveBeenCalledTimes(1);
  });

  it('as contagens do filtro de etapa somam a lista do bloco, com ou sem etapa escolhida', async () => {
    const doBlocoA = PAUTAS_TESTE.filter((p) => p.bloco_slug === 'bloco-a');
    /** Os números de cada link do primeiro filtro de etapa, pelo rótulo do link. */
    const contagensDe = (html: string): Record<string, number> => {
      const filtro =
        /<nav[^>]*aria-label="Filtrar por etapa"[^>]*>(.*?)<\/nav>/.exec(html)?.[1] ?? '';
      return Object.fromEntries(
        [...filtro.matchAll(/([^<>]+)<small>(\d+)<\/small>/g)].map((m): [string, number] => [
          m[1] ?? '',
          Number(m[2]),
        ]),
      );
    };
    const confere = (contagens: Record<string, number>) => {
      expect(contagens.Todas).toBe(doBlocoA.length);
      for (const etapa of STATUS_PUBLICOS) {
        expect(contagens[STATUS[etapa].rotulo] ?? 0).toBe(
          doBlocoA.filter((p) => p.status === etapa).length,
        );
      }
    };
    // Sem etapa: uma busca só, e as contagens saem dela.
    confere(contagensDe(await render({ bloco: 'bloco-a' })));
    expect(buscarPautas).toHaveBeenCalledTimes(1);
    // Com etapa: continua uma busca só, e as contagens não mudam.
    vi.mocked(buscarPautas).mockClear();
    confere(contagensDe(await render({ bloco: 'bloco-a', status: 'prometido' })));
    expect(buscarPautas).toHaveBeenCalledTimes(1);
  });

  it('erro da API sobe para o error.tsx em vez de renderizar a página vazia', async () => {
    vi.mocked(buscarPautas).mockRejectedValue(new Error('API de leitura respondeu 500'));
    await expect(render()).rejects.toThrow('500');
  });
});
