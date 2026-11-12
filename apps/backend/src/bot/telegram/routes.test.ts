import type { Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import type { Chaves } from '../../cripto/cifra';
import { FakeQueue, mensagensNaFila, prepararFilaFalsa } from '../../infra/queue.fake';
import { segredoConfere } from './routes';
import { chaveDoChat } from './update';

const chaves: Chaves = { cifra: Buffer.alloc(32, 1), hmac: Buffer.alloc(32, 2) };
const SEGREDO = 'segredo-do-webhook_123';
const update = {
  update_id: 77,
  message: { message_id: 1, date: 1700000000, chat: { id: 42, type: 'private' }, text: 'oi' },
};

describe('segredoConfere', () => {
  it('aceita só o segredo exato', () => {
    expect(segredoConfere(SEGREDO, SEGREDO)).toBe(true);
    expect(segredoConfere(`${SEGREDO}x`, SEGREDO)).toBe(false);
    expect(segredoConfere(SEGREDO.slice(0, -1) + 'X', SEGREDO)).toBe(false);
    expect(segredoConfere('', SEGREDO)).toBe(false);
    expect(segredoConfere(undefined, SEGREDO)).toBe(false);
  });
});

describe('POST /telegram/webhook', () => {
  let app: FastifyInstance;
  let db: Db;
  let queue: FakeQueue;

  beforeEach(async () => {
    db = await criarBancoEmMemoria();
    await prepararFilaFalsa(db);
    queue = new FakeQueue();
    app = await buildApp({
      db,
      queue,
      logger: pino({ level: 'silent' }),
      chaves,
      telegram: { segredo: SEGREDO },
      leitura: { db, origensCors: [] },
    });
  }, 20_000);
  afterEach(async () => {
    await app.close();
  });

  const post = (segredo?: string, corpo: unknown = update) =>
    app.inject({
      method: 'POST',
      url: '/telegram/webhook',
      payload: JSON.stringify(corpo),
      headers: {
        'content-type': 'application/json',
        ...(segredo === undefined ? {} : { 'x-telegram-bot-api-secret-token': segredo }),
      },
    });

  it('com o segredo certo → 200 e enfileira uma vez, mesmo reenviado', async () => {
    expect((await post(SEGREDO)).statusCode).toBe(200);
    expect((await post(SEGREDO)).statusCode).toBe(200);
    const fila = await mensagensNaFila(db);
    expect(fila).toHaveLength(1);
    expect(fila[0]?.data).toMatchObject({
      phoneNumberId: 'telegram',
      phoneHmac: chaveDoChat(42, chaves),
    });
  });

  it('sem segredo ou com segredo errado → 401 e nada na fila', async () => {
    expect((await post()).statusCode).toBe(401);
    expect((await post('outro')).statusCode).toBe(401);
    expect(await mensagensNaFila(db)).toHaveLength(0);
  });

  it('update que não usamos → 200 (o Telegram não reenvia)', async () => {
    expect((await post(SEGREDO, { update_id: 1, poll: {} })).statusCode).toBe(200);
    expect(await mensagensNaFila(db)).toHaveLength(0);
  });

  it('falha ao enfileirar → 500, para o Telegram reenviar', async () => {
    queue.failSend = true;
    expect((await post(SEGREDO)).statusCode).toBe(500);
  });

  it('sem config da Meta, a rota do WhatsApp não existe', async () => {
    expect((await app.inject({ method: 'POST', url: '/webhook', payload: '{}' })).statusCode).toBe(
      404,
    );
  });
});
