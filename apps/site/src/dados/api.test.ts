import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buscarAtividade, buscarBlocos, buscarConquistas, buscarPauta, buscarPautas } from './api';

const responder = (status: number, corpo: unknown = {}) =>
  vi.fn(() => Promise.resolve(new Response(JSON.stringify(corpo), { status })));

// Todo pedido leva o sinal do tempo limite de 5 s.
const SINAL: unknown = expect.any(AbortSignal);

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
      signal: SINAL,
    });
  });

  it('fresca lê sem o cache de 30 s (o card que o bot pede logo depois do apoio)', async () => {
    const fetch = responder(200, { slug: 'a' });
    vi.stubGlobal('fetch', fetch);
    await buscarPauta('a', { fresca: true });
    expect(fetch).toHaveBeenCalledWith('http://api.teste/pautas/a', {
      cache: 'no-store',
      signal: SINAL,
    });
  });

  it('API que não responde em 5 s lança erro e os pedidos dos 10 s seguintes falham na hora', async () => {
    // Relógio no passado: a pausa termina antes do horário real e não vaza para os outros testes.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2020-01-01T12:00:00Z') });
    const fetch = vi.fn(
      (_url: string, { signal }: RequestInit) =>
        new Promise<Response>((_, rejeitar) =>
          signal?.addEventListener('abort', () => {
            rejeitar(signal.reason as Error);
          }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    // O timer do `AbortSignal.timeout` é interno do Node: o teste troca o sinal por um controlável.
    const controle = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controle.signal);
    try {
      const pedido = buscarPauta('x');
      expect(timeout).toHaveBeenCalledWith(5000);
      controle.abort(new DOMException('tempo esgotado', 'TimeoutError'));
      await expect(pedido).rejects.toThrow('tempo esgotado');

      // A página de erro chama o `generateMetadata` de novo: não espera outros 5 s.
      await expect(buscarPauta('x')).rejects.toThrow('não respondeu há pouco');
      expect(fetch).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date('2020-01-01T12:00:10Z'));
      vi.stubGlobal('fetch', responder(200, { slug: 'x' }));
      expect(await buscarPauta('x')).toEqual({ slug: 'x' });
    } finally {
      timeout.mockRestore();
      vi.useRealTimers();
    }
  });

  it('tempo esgotado no meio do corpo JSON também pausa os pedidos seguintes', async () => {
    // Outro dia: a pausa deixada pelo teste anterior (01/01) não vale aqui.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2020-01-02T12:00:00Z') });
    const resposta = new Response('{}', { status: 200 });
    vi.spyOn(resposta, 'json').mockRejectedValue(
      new DOMException('tempo esgotado', 'TimeoutError'),
    );
    const fetch = vi.fn(() => Promise.resolve(resposta));
    vi.stubGlobal('fetch', fetch);
    try {
      await expect(buscarPauta('x')).rejects.toThrow('tempo esgotado');
      await expect(buscarBlocos()).rejects.toThrow('não respondeu há pouco');
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
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

  it('pauta repetida entre páginas aparece uma vez só', async () => {
    const paginas = [
      { itens: [{ slug: 'a' }, { slug: 'b' }], proximo: 2 },
      { itens: [{ slug: 'b' }, { slug: 'c' }], proximo: null },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(paginas.shift()), { status: 200 }))),
    );
    expect((await buscarPautas()).map((p) => p.slug)).toEqual(['a', 'b', 'c']);
  });

  it('sem bloco, não manda o parâmetro', async () => {
    const fetch = responder(200, { itens: [], proximo: null });
    vi.stubGlobal('fetch', fetch);
    expect(await buscarPautas()).toEqual([]);
    expect(fetch).toHaveBeenCalledWith('http://api.teste/pautas?limit=100&offset=0', {
      next: { revalidate: 30 },
      signal: SINAL,
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

  it('API fora do ar (a conexão falha) lança erro, que cai no error.tsx', async () => {
    // É o caso da homologação desligada: o fetch nem recebe resposta.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
    );
    await expect(buscarBlocos()).rejects.toThrow('fetch failed');
    await expect(buscarPautas()).rejects.toThrow('fetch failed');
  });
});

describe('buscarConquistas e buscarAtividade', () => {
  beforeEach(() => vi.stubEnv('LUMENS_API_URL', 'http://api.teste'));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('conquistas devolve os itens', async () => {
    const fetch = responder(200, { itens: [{ pauta_slug: 'a' }] });
    vi.stubGlobal('fetch', fetch);
    expect(await buscarConquistas()).toEqual([{ pauta_slug: 'a' }]);
    expect(fetch).toHaveBeenCalledWith('http://api.teste/conquistas', {
      next: { revalidate: 30 },
      signal: SINAL,
    });
  });

  it('a página vira limit/offset: a 1 começa do zero, a 3 pula 40', async () => {
    const fetch = responder(200, { itens: [], proximo: null });
    vi.stubGlobal('fetch', fetch);
    await buscarAtividade(1);
    await buscarAtividade(3);
    expect(fetch.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      'http://api.teste/atividade?limit=20&offset=0',
      'http://api.teste/atividade?limit=20&offset=40',
    ]);
  });

  it('500 lança erro (cai no error.tsx)', async () => {
    vi.stubGlobal('fetch', responder(500));
    await expect(buscarConquistas()).rejects.toThrow('500');
    await expect(buscarAtividade(1)).rejects.toThrow('500');
  });
});
