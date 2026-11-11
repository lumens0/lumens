import { type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
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
