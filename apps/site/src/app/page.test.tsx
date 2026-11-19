import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buscarApoiosPorSemana, buscarBlocos, buscarPautas } from '../dados/api';
import exemplo from '../dados/blocos-teste.json';
import { PAUTAS_TESTE } from '../dados/pautas-teste';
import Home from './page';

// O `redirect` do Next lança um erro especial; aqui ele só registra o destino.
const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
}));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('../dados/api', () => ({
  buscarApoiosPorSemana: vi.fn(),
  buscarBlocos: vi.fn(),
  buscarPautas: vi.fn(),
}));

const render = async (params: { bloco?: string; status?: string } = {}) =>
  renderToStaticMarkup(await Home({ searchParams: Promise.resolve(params) }));

describe('início', () => {
  beforeEach(() => {
    vi.mocked(buscarBlocos).mockResolvedValue(exemplo.blocos);
    vi.mocked(buscarPautas).mockResolvedValue(PAUTAS_TESTE as never);
    vi.mocked(buscarApoiosPorSemana).mockResolvedValue([]);
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('mostra os números do campus inteiro e o caminho para a lista, sem filtros nem cartões', async () => {
    const html = await render();
    expect(html).toContain('Todo o campus</h2>');
    expect(buscarPautas).toHaveBeenCalledWith();
    expect(html).toMatch(/<a [^>]*href="\/pautas"[^>]*>Ver as \d+ pautas<\/a>/);
    expect(html).not.toContain('<select');
    expect(html).not.toContain('<article');
  });

  it('link antigo com filtro na raiz vai para /pautas com os mesmos filtros, sem chamar a API', async () => {
    await expect(render({ bloco: 'bloco-a', status: 'cobrando' })).rejects.toThrow(
      'REDIRECT:/pautas?status=cobrando&bloco=bloco-a',
    );
    expect(buscarPautas).not.toHaveBeenCalled();
  });

  it('a raiz sem filtro não redireciona', async () => {
    await render();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('erro da API sobe para o error.tsx em vez de renderizar a página vazia', async () => {
    vi.mocked(buscarPautas).mockRejectedValue(new Error('API de leitura respondeu 500'));
    await expect(render()).rejects.toThrow('500');
  });
});
