import { type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VALIDADE_DO_ESTADO_MS, buildApp } from './app';
import type { Chaves } from './cripto/cifra';
import { FakeQueue, prepararFilaFalsa } from './infra/queue.fake';

const config = { verifyToken: 'verify-SECRET-123', appSecret: 'segredo-app' };
const chaves: Chaves = { cifra: Buffer.alloc(32, 1), hmac: Buffer.alloc(32, 2) };

/**
 * O oráculo é o critério de aceite da SCRUM-93 — `GET /saude` responde 200 e o banco fora do ar
 * derruba o check —, não o corpo da função. Por isso os testes olham só status e corpo.
 */
describe('GET /saude', () => {
  let db: Db;
  let logs: string[];
  let app: FastifyInstance | undefined;

  async function montar(dbDoApp: Db): Promise<FastifyInstance> {
    const logger = pino({ level: 'error' }, { write: (linha: string) => logs.push(linha) });
    app = await buildApp({
      config,
      db: dbDoApp,
      queue: new FakeQueue(),
      logger,
      chaves,
      leitura: { db, origensCors: [] },
    });
    return app;
  }

  // PGlite leva alguns segundos para subir no primeiro teste.
  beforeEach(async () => {
    db = await criarBancoEmMemoria();
    await prepararFilaFalsa(db);
    logs = [];
    app = undefined;
  }, 20_000);

  afterEach(async () => {
    await app?.close();
  });

  it('responde 200 quando o banco responde', async () => {
    const resposta = await (await montar(db)).inject({ method: 'GET', url: '/saude' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ ok: true });
  });

  it('responde 503 quando a consulta ao banco falha', async () => {
    // O healthcheck só chama execute, e os plugins guardam o Db sem usá-lo ao registrar —
    // se um dia passarem a usar, este teste quebra e avisa. O cast é porque o execute do
    // drizzle devolve PgRaw (thenable), não Promise, e aqui basta rejeitar.
    const bancoFora = {
      execute: () => Promise.reject(new Error('conexão recusada')),
    } as unknown as Db;

    const resposta = await (await montar(bancoFora)).inject({ method: 'GET', url: '/saude' });

    expect(resposta.statusCode).toBe(503);
    expect(resposta.json()).toEqual({ ok: false });
  });

  // O /health antigo respondia ok sem consultar nada. Se voltar, volta o falso positivo:
  // processo vivo com banco fora do ar passando no check da hospedagem.
  it('não expõe mais o /health que não checava o banco', async () => {
    const resposta = await (await montar(db)).inject({ method: 'GET', url: '/health' });

    expect(resposta.statusCode).toBe(404);
  });
});

/**
 * SCRUM-341: o chip da Evolution numa rota própria. O oráculo é o critério do ticket (o estado da
 * conexão aparece numa checagem automática) mais a regra de não derrubar o /saude por ele.
 */
describe('GET /saude/whatsapp', () => {
  let db: Db;
  let logs: string[];
  let app: FastifyInstance | undefined;

  async function montar(evolution?: { estadoDaConexao?: () => Promise<string> }) {
    const logger = pino({ level: 'warn' }, { write: (linha: string) => logs.push(linha) });
    app = await buildApp({
      db,
      queue: new FakeQueue(),
      logger,
      chaves,
      leitura: { db, origensCors: [] },
      ...(evolution ? { evolution: { segredo: 'segredo-webhook', ...evolution } } : {}),
    });
    return app;
  }

  const pedir = (servidor: FastifyInstance) =>
    servidor.inject({ method: 'GET', url: '/saude/whatsapp' });

  beforeEach(async () => {
    db = await criarBancoEmMemoria();
    await prepararFilaFalsa(db);
    logs = [];
    app = undefined;
  }, 20_000);

  afterEach(async () => {
    vi.useRealTimers();
    await app?.close();
  });

  it('responde 200 com o chip conectado', async () => {
    const resposta = await pedir(await montar({ estadoDaConexao: () => Promise.resolve('open') }));

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ ok: true });
  });

  it.each([
    ['sessão caída', 'close'],
    ['reconectando', 'connecting'],
    ['chave errada', 'http_401'],
    ['Evolution fora do ar', 'sem_resposta'],
  ])('%s: 503 com corpo genérico, e o motivo só no log', async (_caso, estado) => {
    const resposta = await pedir(await montar({ estadoDaConexao: () => Promise.resolve(estado) }));

    expect(resposta.statusCode).toBe(503);
    expect(resposta.json()).toEqual({ ok: false });
    expect(logs.join('')).toContain(`"estado":"${estado}"`);
  });

  it('canal da Evolution sem consulta ligada responde 503, não 404', async () => {
    const resposta = await pedir(await montar({}));

    expect(resposta.statusCode).toBe(503);
  });

  it('pedidos seguidos dividem uma consulta, e ela vale 10 s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    let consultas = 0;
    const servidor = await montar({
      estadoDaConexao: () => {
        consultas += 1;
        return Promise.resolve('close');
      },
    });

    await Promise.all([pedir(servidor), pedir(servidor), pedir(servidor)]);
    expect(consultas).toBe(1);
    expect(logs).toHaveLength(1);

    vi.setSystemTime(Date.now() + VALIDADE_DO_ESTADO_MS);
    await pedir(servidor);
    expect(consultas).toBe(2);
  });

  it('chip caído não derruba o /saude, que é o healthcheck do contêiner', async () => {
    const servidor = await montar({ estadoDaConexao: () => Promise.resolve('close') });

    expect((await servidor.inject({ method: 'GET', url: '/saude' })).statusCode).toBe(200);
  });

  it('com o WhatsApp pela Meta ou pelo Telegram, a rota não existe', async () => {
    expect((await pedir(await montar())).statusCode).toBe(404);
  });
});
