import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STATUS_PUBLICOS } from '@lumens/contratos';
import { STATUS } from '../componentes/StatusPill';
import { buscarApoiosPorSemana, buscarBlocos, buscarPautas } from '../dados/api';
import exemplo from '../dados/blocos-teste.json';
import { PAUTAS_TESTE } from '../dados/pautas-teste';
import Home from './page';

// O filtro usa o router do Next, que não existe fora do app.
vi.mock('../componentes/FiltroBloco', () => ({ FiltroBloco: () => null }));
vi.mock('../dados/api', () => ({
  buscarApoiosPorSemana: vi.fn(),
  buscarBlocos: vi.fn(),
  buscarPautas: vi.fn(),
}));

const render = async (bloco?: string, status?: string) =>
  renderToStaticMarkup(
    await Home({
      searchParams: Promise.resolve({ ...(bloco ? { bloco } : {}), ...(status ? { status } : {}) }),
    }),
  );

/** Um total da faixa: o número animado, escondido do leitor de tela, e o valor final oculto. */
const total = (rotulo: string, n: string) =>
  new RegExp(
    `<dt>${rotulo}</dt><dd><span aria-hidden="true">${n}</span><span class="[^"]*somenteLeitor[^"]*">${n}</span></dd>`,
  );

describe('home', () => {
  beforeEach(() => {
    vi.mocked(buscarBlocos).mockResolvedValue(exemplo.blocos);
    vi.mocked(buscarPautas).mockResolvedValue([]);
    vi.mocked(buscarApoiosPorSemana).mockResolvedValue([]);
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
    expect(html).toMatch(total('Apoios', '499'));
    expect(html).toMatch(total('Pautas abertas', '0'));
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

  it('status combinado ao bloco filtra a lista e os totais', async () => {
    // A busca vem sem o filtro de status; a home filtra e conta a partir das pautas do bloco.
    const doBlocoA = PAUTAS_TESTE.filter((p) => p.bloco_slug === 'bloco-a');
    expect(doBlocoA.some((p) => p.status !== 'prometido')).toBe(true);
    vi.mocked(buscarPautas).mockResolvedValue(doBlocoA as never);
    const html = await render('bloco-a', 'prometido');
    expect(buscarPautas).toHaveBeenCalledTimes(1);
    expect(buscarPautas).toHaveBeenCalledWith('bloco-a');
    expect(html).toMatch(total('Apoios', '0'));
    expect(html).toContain('Nenhuma pauta prometida neste bloco');
  });

  it('status não público não segue para a busca', async () => {
    await Home({ searchParams: Promise.resolve({ status: 'em_curadoria' }) });
    expect(buscarPautas).toHaveBeenCalledWith(undefined);
  });

  it('erro da API sobe para o error.tsx em vez de renderizar a página vazia', async () => {
    vi.mocked(buscarPautas).mockRejectedValue(new Error('API de leitura respondeu 500'));
    await expect(render()).rejects.toThrow('500');
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
    vi.mocked(buscarPautas).mockResolvedValue(doBlocoA as never);
    confere(contagensDe(await render('bloco-a')));
    expect(buscarPautas).toHaveBeenCalledTimes(1);
    // Com etapa: continua uma busca só, e as contagens não mudam.
    vi.mocked(buscarPautas).mockClear();
    confere(contagensDe(await render('bloco-a', 'prometido')));
    expect(buscarPautas).toHaveBeenCalledTimes(1);
  });
});
