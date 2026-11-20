import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buscarBlocos, buscarPautas } from '../../dados/api';
import Mapa, { metadata } from './page';

vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('../../dados/api', () => ({ buscarBlocos: vi.fn(), buscarPautas: vi.fn() }));

const render = async (bloco?: string | string[]) =>
  renderToStaticMarkup(await Mapa({ searchParams: Promise.resolve(bloco ? { bloco } : {}) }));

describe('/mapa', () => {
  afterEach(() => vi.resetAllMocks());

  it('tem título e descrição próprios', () => {
    expect(metadata.title).toBe('Mapa do campus · Lumens');
    expect(metadata.description).toContain('Campus A.C. Simões');
  });

  it('lê blocos e pautas na hora do pedido e desenha o mapa', async () => {
    vi.mocked(buscarBlocos).mockResolvedValue([]);
    vi.mocked(buscarPautas).mockResolvedValue([]);
    const html = await render();
    expect(buscarBlocos).toHaveBeenCalledTimes(1);
    expect(buscarPautas).toHaveBeenCalledTimes(1);
    expect(html).toContain('Onde há pautas');
    expect(html).toContain('role="application"');
  });

  it('?bloco= repetido (lista) é ignorado em vez de quebrar', async () => {
    vi.mocked(buscarBlocos).mockResolvedValue([]);
    vi.mocked(buscarPautas).mockResolvedValue([]);
    await expect(render(['a', 'b'])).resolves.toContain('Onde há pautas');
  });

  it('erro da API sobe para o error.tsx', async () => {
    vi.mocked(buscarBlocos).mockRejectedValue(new Error('API fora do ar'));
    vi.mocked(buscarPautas).mockResolvedValue([]);
    await expect(render()).rejects.toThrow('API fora do ar');
  });
});
