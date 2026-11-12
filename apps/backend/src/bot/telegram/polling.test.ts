import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { iniciarPolling } from './polling';

const silencioso = pino({ level: 'silent' });

/** Uma API falsa que devolve os lotes na ordem e, acabados, fica "esperando" até o abort. */
function apiCom(lotes: (object[] | Error)[]) {
  const chamadas: { metodo: string; params: Record<string, unknown> }[] = [];
  const chamar = vi.fn(
    (
      metodo: string,
      params: Record<string, unknown> = {},
      opcoes: { sinal?: AbortSignal } = {},
    ) => {
      chamadas.push({ metodo, params });
      if (metodo !== 'getUpdates') return Promise.resolve(true);
      const lote = lotes.shift();
      if (lote instanceof Error) return Promise.reject(lote);
      if (lote) return Promise.resolve(lote);
      return new Promise((_resolve, reject) => {
        opcoes.sinal?.addEventListener('abort', () => {
          reject(new Error('abortado'));
        });
      });
    },
  );
  return { api: { chamar: chamar as never }, chamadas, chamar };
}

const ate = async (condicao: () => boolean) => {
  for (let i = 0; i < 2000 && !condicao(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(condicao()).toBe(true);
};

describe('iniciarPolling', () => {
  it('remove o webhook, processa os updates e avança o offset', async () => {
    const { api, chamadas } = apiCom([[{ update_id: 10 }, { update_id: 11 }], [{ update_id: 12 }]]);
    const processados: unknown[] = [];
    const polling = await iniciarPolling({
      api,
      processar: (u) => {
        processados.push(u);
        return Promise.resolve();
      },
      logger: silencioso,
    });
    await ate(() => chamadas.filter((c) => c.metodo === 'getUpdates').length === 3);
    await polling.parar();

    expect(chamadas[0]).toEqual({
      metodo: 'deleteWebhook',
      params: { drop_pending_updates: false },
    });
    const offsets = chamadas.filter((c) => c.metodo === 'getUpdates').map((c) => c.params.offset);
    expect(offsets).toEqual([undefined, 12, 13]);
    expect(chamadas[1]?.params).toMatchObject({ timeout: 30 });
    expect(processados).toEqual([{ update_id: 10 }, { update_id: 11 }, { update_id: 12 }]);
  });

  it('se o processamento falha, espera e busca de novo o mesmo update (offset não avança)', async () => {
    const { api, chamadas } = apiCom([[{ update_id: 5 }], [{ update_id: 5 }]]);
    const esperar = vi.fn(() => Promise.resolve());
    const processar = vi
      .fn()
      .mockRejectedValueOnce(new Error('banco fora'))
      .mockResolvedValue(undefined);
    const polling = await iniciarPolling({ api, processar, logger: silencioso, esperar });
    await ate(() => chamadas.filter((c) => c.metodo === 'getUpdates').length === 3);
    await polling.parar();

    const offsets = chamadas.filter((c) => c.metodo === 'getUpdates').map((c) => c.params.offset);
    expect(offsets).toEqual([undefined, undefined, 6]);
    expect(processar).toHaveBeenCalledTimes(2);
    expect(esperar).toHaveBeenCalledTimes(1);
  });

  it('erro do getUpdates: espera com backoff dobrando até o teto', async () => {
    const { api, chamadas } = apiCom([
      new Error('rede'),
      new Error('rede'),
      new Error('rede'),
      new Error('rede'),
    ]);
    const esperar = vi.fn(() => Promise.resolve());
    const polling = await iniciarPolling({
      api,
      processar: () => Promise.resolve(),
      logger: silencioso,
      esperar,
      esperaInicialMs: 1000,
      esperaMaximaMs: 3000,
    });
    await ate(() => chamadas.filter((c) => c.metodo === 'getUpdates').length === 5);
    await polling.parar();
    expect(esperar.mock.calls.map((c) => (c as unknown[])[0])).toEqual([1000, 2000, 3000, 3000]);
  });

  it('parar() interrompe o getUpdates pendurado e termina', async () => {
    const { api, chamar } = apiCom([]);
    const polling = await iniciarPolling({
      api,
      processar: () => Promise.resolve(),
      logger: silencioso,
    });
    await ate(() => chamar.mock.calls.length === 2);
    await expect(polling.parar()).resolves.toBeUndefined();
    expect(chamar).toHaveBeenCalledTimes(2);
  });
});
