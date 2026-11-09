import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buscarPauta } from './api';

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
