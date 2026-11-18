import type { Db } from '@lumens/db';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { FakeQueue } from './queue.fake';
import { MUITAS_REQUISICOES } from './limite';

/** Banco falso que conta as consultas: a prova de que o 429 não chegou ao banco. */
function bancoQueConta() {
  const contador = { consultas: 0 };
  const db = {
    execute: () => {
      contador.consultas++;
      return Promise.resolve({ rows: [] });
    },
  } as unknown as Db;
  return { db, contador };
}

describe('limite de requisições por IP (SCRUM-310)', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function montar(max: number) {
    const { db, contador } = bancoQueConta();
    app = await buildApp({
      config: { verifyToken: 'verify', appSecret: 'segredo' },
      db,
      queue: new FakeQueue(),
      logger: pino({ level: 'silent' }),
      chaves: { cifra: Buffer.alloc(32, 1), hmac: Buffer.alloc(32, 2) },
      leitura: { db, origensCors: [] },
      limites: { api: { max, janelaMs: 60_000 }, webhooks: { max, janelaMs: 60_000 } },
    });
    const pedir = (url: string, ip = '203.0.113.7') =>
      (app as FastifyInstance).inject({
        method: 'GET',
        url,
        // Como o Caddy manda: o IP do cliente no fim do X-Forwarded-For.
        headers: { 'x-forwarded-for': ip },
      });
    return { pedir, contador };
  }

  it('acima do limite, a API responde 429 sem consultar o banco', async () => {
    const { pedir, contador } = await montar(2);

    expect((await pedir('/blocos')).statusCode).toBe(200);
    expect((await pedir('/blocos')).statusCode).toBe(200);
    const consultasAntes = contador.consultas;
    const barrada = await pedir('/blocos');

    expect(barrada.statusCode).toBe(429);
    expect(barrada.json()).toEqual({ erro: MUITAS_REQUISICOES });
    expect(barrada.headers['retry-after']).toBeDefined();
    expect(barrada.headers['cache-control']).toBe('no-store');
    expect(contador.consultas).toBe(consultasAntes);
  });

  it('cada IP tem a sua conta, e o que vem antes no X-Forwarded-For não muda a conta', async () => {
    const { pedir } = await montar(1);

    expect((await pedir('/blocos', '198.51.100.1')).statusCode).toBe(200);
    expect((await pedir('/blocos', '198.51.100.2')).statusCode).toBe(200);
    // Inventar um IP na frente não abre conta nova: vale o último, que é o que o Caddy pôs.
    expect((await pedir('/blocos', '10.9.9.9, 198.51.100.1')).statusCode).toBe(429);
  });

  it('o /saude fica fora do limite: é o healthcheck do compose e do deploy', async () => {
    const { pedir } = await montar(1);

    for (let i = 0; i < 5; i++) expect((await pedir('/saude')).statusCode).toBe(200);
  });

  it('os webhooks têm a própria conta, separada da API', async () => {
    const { pedir } = await montar(1);
    await pedir('/blocos');

    // Handshake da Meta com o token errado: 403, e não 429, porque a conta da API não vale aqui.
    expect((await pedir('/webhook?hub.mode=subscribe&hub.verify_token=x')).statusCode).toBe(403);
    expect((await pedir('/webhook?hub.mode=subscribe&hub.verify_token=x')).statusCode).toBe(429);
  });

  it('corpo acima de 1 MiB no webhook é recusado antes da assinatura', async () => {
    await montar(10);

    const resposta = await (app as FastifyInstance).inject({
      method: 'POST',
      url: '/webhook',
      headers: { 'content-type': 'application/json' },
      payload: `{"x":"${'a'.repeat(1024 * 1024)}"}`,
    });

    expect(resposta.statusCode).toBe(413);
  });
});
