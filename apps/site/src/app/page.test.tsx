import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buscarBlocos, buscarPautas } from '../dados/api';
import exemplo from '../dados/blocos-teste.json';
import { PAUTAS_TESTE } from '../dados/pautas-teste';
import Home from './page';

// O filtro usa o router do Next, que não existe fora do app.
vi.mock('../componentes/FiltroBloco', () => ({ FiltroBloco: () => null }));
vi.mock('../dados/api', () => ({ buscarBlocos: vi.fn(), buscarPautas: vi.fn() }));

const render = async (bloco?: string) =>
  renderToStaticMarkup(
    await Home({ searchParams: Promise.resolve(bloco === undefined ? {} : { bloco }) }),
  );

describe('home', () => {
  beforeEach(() => {
    vi.mocked(buscarBlocos).mockResolvedValue(exemplo.blocos);
    vi.mocked(buscarPautas).mockResolvedValue([]);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it('com a lista vazia, "Relatar um problema" aparece uma vez só (o da ListaVazia)', async () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '5582999999999');
    const html = await render();
    expect(html).toContain('Ainda não tem pauta no site.');
    expect(html.match(/Relatar um problema<\/a>/g)).toHaveLength(1);
  });

  it('lista e totais vêm da API, e o filtro de bloco vai para a busca', async () => {
    const doBlocoA = PAUTAS_TESTE.filter((p) => p.bloco_slug === 'bloco-a');
    vi.mocked(buscarPautas).mockResolvedValue(doBlocoA as never);
    const html = await render('bloco-a');
    expect(buscarPautas).toHaveBeenCalledWith('bloco-a');
    expect(html).toContain('Bloco A</h2>');
    for (const p of doBlocoA) expect(html).toContain(p.titulo);
    // Totais da lista filtrada: 143 + 356 apoios, nenhuma aberta, nenhuma conquista.
    expect(html).toContain('<dt>Apoios</dt><dd>499</dd>');
    expect(html).toContain('<dt>Pautas abertas</dt><dd>0</dd>');
  });

  it('o leitor de tela ouve os totais uma vez, sem os quadros da animação (SCRUM-58)', async () => {
    const doBlocoA = PAUTAS_TESTE.filter((p) => p.bloco_slug === 'bloco-a');
    vi.mocked(buscarPautas).mockResolvedValue(doBlocoA as never);
    const html = await render('bloco-a');
    // Os números visíveis sobem de zero: dentro de uma região viva, cada quadro seria anunciado.
    expect(html).not.toContain('aria-live');
    expect(html).toMatch(
      /<p role="status"[^>]*>Bloco A: 0 pautas abertas, 499 apoios e 0 conquistas\.<\/p>/,
    );
  });

  it('bloco que não existe busca todas as pautas', async () => {
    await render('nao-existe');
    expect(buscarPautas).toHaveBeenCalledWith(undefined);
  });

  it('erro da API sobe para o error.tsx em vez de renderizar a página vazia', async () => {
    vi.mocked(buscarPautas).mockRejectedValue(new Error('API de leitura respondeu 500'));
    await expect(render()).rejects.toThrow('500');
  });
});
