import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buscarBlocos, buscarPauta, buscarPautas } from './api';

const responder = (status: number, corpo: unknown = {}) =>
  vi.fn(() => Promise.resolve(new Response(JSON.stringify(corpo), { status })));

describe('buscarPauta', () => {
  beforeEach(() => vi.stubEnv('LUMENS_API_URL', 'http://api.teste/'));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('200 devolve a pauta, com o slug codificado e revalidação de 30 s', async () => {
    const fetch = responder(200, { slug: 'a-b' });
    vi.stubGlobal('fetch', fetch);
    expect(await buscarPauta('a b')).toEqual({ slug: 'a-b' });
    expect(fetch).toHaveBeenCalledWith('http://api.teste/pautas/a%20b', {
      next: { revalidate: 30 },
    });
  });

  it.each([404, 400])('%i vira null', async (status) => {
    vi.stubGlobal('fetch', responder(status));
    expect(await buscarPauta('nao-existe')).toBeNull();
  });

  it('500 lança erro', async () => {
    vi.stubGlobal('fetch', responder(500));
    await expect(buscarPauta('x')).rejects.toThrow('500');
  });

  it('sem LUMENS_API_URL, lança erro claro', async () => {
    vi.stubEnv('LUMENS_API_URL', '');
    vi.stubGlobal('fetch', responder(200));
    await expect(buscarPauta('x')).rejects.toThrow('LUMENS_API_URL');
  });
});

describe('buscarPautas e buscarBlocos', () => {
  beforeEach(() => vi.stubEnv('LUMENS_API_URL', 'http://api.teste'));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('segue o `proximo` até a última página e repassa o bloco', async () => {
    const paginas = [
      { itens: [{ slug: 'a' }], proximo: 100 },
      { itens: [{ slug: 'b' }], proximo: null },
    ];
    const fetch = vi.fn((_url: string) =>
      Promise.resolve(new Response(JSON.stringify(paginas.shift()), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetch);
    const pautas = await buscarPautas('bloco-a');
    expect(pautas.map((p) => p.slug)).toEqual(['a', 'b']);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      'http://api.teste/pautas?limit=100&offset=0&bloco=bloco-a',
      'http://api.teste/pautas?limit=100&offset=100&bloco=bloco-a',
    ]);
  });

  it('sem bloco, não manda o parâmetro', async () => {
    const fetch = responder(200, { itens: [], proximo: null });
    vi.stubGlobal('fetch', fetch);
    expect(await buscarPautas()).toEqual([]);
    expect(fetch).toHaveBeenCalledWith('http://api.teste/pautas?limit=100&offset=0', {
      next: { revalidate: 30 },
    });
  });

  it('blocos devolve os itens', async () => {
    vi.stubGlobal('fetch', responder(200, { itens: [{ slug: 'ic' }] }));
    expect(await buscarBlocos()).toEqual([{ slug: 'ic' }]);
  });

  it.each([404, 500])('%i na lista ou nos blocos lança erro (cai no error.tsx)', async (status) => {
    vi.stubGlobal('fetch', responder(status));
    await expect(buscarPautas()).rejects.toThrow(String(status));
    await expect(buscarBlocos()).rejects.toThrow(String(status));
  });
});
