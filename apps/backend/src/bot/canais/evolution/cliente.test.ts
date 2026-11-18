import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import type { ConfigEvolution } from '../../../config/env';
import type { Chaves } from '../../../cripto/cifra';
import { criarConsultaDaConexao } from './cliente';
import { criarCanalEvolution } from './index';

/** fetch falso de uma resposta só; `Error` simula falha de rede. Guarda o pedido feito. */
function fetchFalso(resposta: { status: number; corpo: unknown } | Error) {
  const pedidos: { url: string; headers: Headers }[] = [];
  const fn: typeof fetch = (url, init) => {
    const endereco = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    pedidos.push({ url: endereco, headers: new Headers(init?.headers) });
    if (resposta instanceof Error) return Promise.reject(resposta);
    return Promise.resolve(
      new Response(JSON.stringify(resposta.corpo), {
        status: resposta.status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  return { fn, pedidos };
}

const opcoes = { url: 'http://evolution:8080/', apiKey: 'chave', instancia: 'lumens demo' };
const consulta = (fn: typeof fetch, timeoutMs?: number) =>
  criarConsultaDaConexao({ ...opcoes, fetch: fn, ...(timeoutMs ? { timeoutMs } : {}) });

describe('criarConsultaDaConexao (SCRUM-341)', () => {
  it('devolve o estado da sessão em memória, pedindo com a chave e o nome da instância', async () => {
    const { fn, pedidos } = fetchFalso({
      status: 200,
      corpo: { instance: { instanceName: 'lumens demo', state: 'open' } },
    });

    expect(await consulta(fn)()).toBe('open');
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]?.url).toBe('http://evolution:8080/instance/connectionState/lumens%20demo');
    expect(pedidos[0]?.headers.get('apikey')).toBe('chave');
  });

  it('sessão caída devolve o estado como veio', async () => {
    const { fn } = fetchFalso({ status: 200, corpo: { instance: { state: 'close' } } });
    expect(await consulta(fn)()).toBe('close');
  });

  it.each([
    ['chave errada', { status: 401, corpo: { error: 'Unauthorized' } }, 'http_401'],
    ['instância inexistente', { status: 404, corpo: { error: 'Not Found' } }, 'http_404'],
    ['corpo sem o estado', { status: 200, corpo: { instance: {} } }, 'resposta_inesperada'],
    [
      'estado que não é texto',
      { status: 200, corpo: { instance: { state: 1 } } },
      'resposta_inesperada',
    ],
  ])('%s: diz o motivo, sem o corpo da resposta', async (_caso, resposta, esperado) => {
    expect(await consulta(fetchFalso(resposta).fn)()).toBe(esperado);
  });

  it('Evolution fora do ar vira sem_resposta, sem lançar', async () => {
    expect(await consulta(fetchFalso(new Error('ECONNREFUSED')).fn)()).toBe('sem_resposta');
  });

  it('Evolution que não responde é largada no tempo limite', async () => {
    // Só termina quando o sinal do pedido aborta: sem o tempo limite, o teste fica pendurado.
    const travado: typeof fetch = (_url, init) =>
      new Promise((_resolve, rejeitar) => {
        init?.signal?.addEventListener('abort', () => {
          rejeitar(new DOMException('tempo esgotado', 'TimeoutError'));
        });
      });

    expect(await consulta(travado, 20)()).toBe('sem_resposta');
  }, 2_000);
});

describe('criarCanalEvolution: consulta do chip para o /saude/whatsapp', () => {
  const chaves: Chaves = { cifra: Buffer.alloc(32, 1), hmac: Buffer.alloc(32, 2) };
  const logger = pino({ level: 'silent' });
  const config: ConfigEvolution = {
    instancia: 'lumens',
    segredoDoWebhook: 'segredo',
    limitePessoas: 10,
    avisosPorLote: 2,
    intervaloMinMs: 0,
    intervaloMaxMs: 0,
  };

  it('com URL e chave, devolve a consulta ligada à Evolution', async () => {
    const { fn, pedidos } = fetchFalso({ status: 200, corpo: { instance: { state: 'open' } } });
    const canal = criarCanalEvolution({
      config: { ...config, url: 'http://evolution:8080', apiKey: 'chave' },
      logger,
      chaves,
      modoDev: false,
      fetch: fn,
    });

    expect(await canal.estadoDaConexao?.()).toBe('open');
    expect(pedidos[0]?.url).toBe('http://evolution:8080/instance/connectionState/lumens');
  });

  it('no dev sem URL, não há chip para consultar', () => {
    const canal = criarCanalEvolution({ config, logger, chaves, modoDev: true });

    expect(canal.estadoDaConexao).toBeUndefined();
  });
});
