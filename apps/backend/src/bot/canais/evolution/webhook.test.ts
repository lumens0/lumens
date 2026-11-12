import { mensagensProcessadas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../app';
import { decifrar, hmacHex, type Chaves } from '../../../cripto/cifra';
import {
  FakeQueue,
  mensagensNaFila,
  prepararFilaFalsa,
  statusNaFila,
} from '../../../infra/queue.fake';
import { hashPhone } from '../../conversation/phone';
import {
  evolutionEncaminhada,
  evolutionGrupo,
  evolutionImagem,
  evolutionPropria,
  evolutionSoLid,
  evolutionStatus,
  evolutionTexto,
  envelope,
} from '../../sim/evolution';
import { conteudoDoJob } from '../../webhook/process';
import { ROTA_DO_WEBHOOK } from './webhook';

const SEGREDO = 's'.repeat(40);
const chaves: Chaves = { cifra: Buffer.alloc(32, 1), hmac: Buffer.alloc(32, 2) };
const PHONE = '5582988887777';

describe('webhook da Evolution (SCRUM-275)', () => {
  let app: FastifyInstance;
  let db: Db;
  let logs: string[];

  beforeEach(async () => {
    db = await criarBancoEmMemoria();
    await prepararFilaFalsa(db);
    logs = [];
    const logger = pino({ level: 'debug' }, { write: (linha: string) => logs.push(linha) });
    app = await buildApp({
      db,
      queue: new FakeQueue(),
      logger,
      chaves,
      leitura: { origensCors: [], db },
      evolution: { segredo: SEGREDO },
    });
  }, 20_000);
  afterEach(async () => {
    await app.close();
  });

  const post = (payload: unknown, autorizacao: string | null = `Bearer ${SEGREDO}`) =>
    app.inject({
      method: 'POST',
      url: ROTA_DO_WEBHOOK,
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
      headers: {
        'content-type': 'application/json',
        ...(autorizacao === null ? {} : { authorization: autorizacao }),
      },
    });
  const jobs = () => mensagensNaFila(db);
  const conteudo = async () => {
    const [job] = await jobs();
    if (!job) throw new Error('nada foi enfileirado');
    return conteudoDoJob(job.data, chaves);
  };

  describe('autenticação', () => {
    it.each([
      ['sem o header', null],
      ['com outro segredo', `Bearer ${'x'.repeat(40)}`],
      ['com o segredo sem o Bearer', SEGREDO],
    ])('%s → 401 e nada na fila', async (_caso, autorizacao) => {
      const res = await post(evolutionTexto({ body: 'oi', from: PHONE }), autorizacao);
      expect(res.statusCode).toBe(401);
      expect(await jobs()).toEqual([]);
    });

    it('não lê o corpo sem o segredo: JSON quebrado também volta 401', async () => {
      expect((await post('{quebrado', null)).statusCode).toBe(401);
    });
  });

  it('texto 1:1 vira o mesmo job da Meta: telefone em HMAC e cifrado, instância no lugar do número do bot', async () => {
    const res = await post(
      evolutionTexto({ body: 'oi', from: PHONE, id: '3EB0AAA', timestamp: 1_700_000_000 }),
    );

    expect(res.statusCode).toBe(200);
    const [job, ...resto] = await jobs();
    expect(resto).toEqual([]);
    expect(job?.data).toMatchObject({
      phoneHmac: hashPhone(PHONE, chaves.hmac),
      wamidHmac: hmacHex('3EB0AAA', chaves.hmac),
      phoneNumberId: 'lumens',
      type: 'text',
      timestamp: '1700000000',
    });
    if (!job) throw new Error('nada foi enfileirado');
    expect(decifrar(job.data.phoneCifrado, chaves.cifra)).toBe(PHONE);
    expect(await conteudo()).toEqual({ text: { body: 'oi' } });
    expect(JSON.stringify(job.data)).not.toContain(PHONE);
  });

  it('LID com o número em remoteJidAlt: vale o número', async () => {
    await post(evolutionTexto({ body: 'oi', from: PHONE, lid: '987654321098765' }));
    const [job] = await jobs();
    expect(job?.data.phoneHmac).toBe(hashPhone(PHONE, chaves.hmac));
  });

  it('LID sem número: ignorada com 200, e o log não leva o LID', async () => {
    const res = await post(evolutionSoLid({ body: 'oi', lid: '987654321098765' }));

    expect(res.statusCode).toBe(200);
    expect(await jobs()).toEqual([]);
    expect(logs.join('\n')).toContain('sem número');
    expect(logs.join('\n')).not.toContain('987654321098765');
  });

  it.each([
    ['grupo', evolutionGrupo({ body: 'oi', from: PHONE })],
    ['mensagem do próprio chip (fromMe)', evolutionPropria({ body: 'oi', from: PHONE })],
    [
      'status do WhatsApp',
      envelope('messages.upsert', {
        key: { remoteJid: 'status@broadcast', fromMe: false, id: '3EB0STATUS' },
        message: { conversation: 'oi' },
      }),
    ],
    [
      'reação',
      envelope('messages.upsert', {
        key: { remoteJid: `${PHONE}@s.whatsapp.net`, fromMe: false, id: '3EB0REACAO' },
        message: { reactionMessage: { text: '👍' } },
      }),
    ],
    ['outro evento', envelope('contacts.update', [{ id: `${PHONE}@s.whatsapp.net` }])],
  ])('%s: 200 e nada na fila', async (_caso, payload) => {
    expect((await post(payload)).statusCode).toBe(200);
    expect(await jobs()).toEqual([]);
  });

  it('a mesma mensagem duas vezes entra uma vez só (dedup pelo id)', async () => {
    const payload = evolutionTexto({ body: 'oi', from: PHONE, id: '3EB0DUP' });
    await post(payload);
    await post(payload);

    expect(await jobs()).toHaveLength(1);
    expect(await db.select().from(mensagensProcessadas)).toHaveLength(1);
  });

  it('encaminhada leva context.forwarded; muitas vezes, frequently_forwarded', async () => {
    await post(evolutionEncaminhada({ body: 'repassem', from: PHONE, vezes: 5 }));
    expect(await conteudo()).toEqual({
      text: { body: 'repassem' },
      context: { forwarded: true, frequently_forwarded: true },
    });
  });

  it('imagem leva a mensagem inteira como referência da mídia, e a legenda', async () => {
    await post(evolutionImagem({ from: PHONE, id: '3EB0IMG', caption: 'poste apagado' }));

    const [job] = await jobs();
    expect(job?.data.type).toBe('image');
    const { image } = await conteudo();
    expect(image).toMatchObject({ mime_type: 'image/jpeg', caption: 'poste apagado' });
    const referencia = JSON.parse(image?.id ?? '') as {
      key: { id: string };
      message: { imageMessage: { mediaKey: string; directPath: string } };
    };
    expect(referencia.key.id).toBe('3EB0IMG');
    expect(referencia.message.imageMessage).toMatchObject({
      mediaKey: 'Y2hhdmUtc2ltdWxhZGE=',
      directPath: '/v/t62.7118-24/simulada.enc',
    });
  });

  it('áudio entra na fila como tipo que o bot ainda não entende', async () => {
    await post(
      envelope('messages.upsert', {
        key: { remoteJid: `${PHONE}@s.whatsapp.net`, fromMe: false, id: '3EB0AUDIO' },
        message: { audioMessage: { mimetype: 'audio/ogg' }, messageContextInfo: {} },
      }),
    );
    const [job] = await jobs();
    expect(job?.data.type).toBe('audio');
  });

  it('entrega de mensagem do bot vira status pelo HMAC do id; de outra pessoa, não', async () => {
    await post(evolutionStatus({ id: '3EB0AVISO', status: 'DELIVERY_ACK' }));
    await post(envelope('messages.update', { keyId: '3EB0OUTRA', fromMe: false, status: 'READ' }));

    const status = await statusNaFila(db);
    expect(status.map((s) => s.data)).toEqual([
      expect.objectContaining({
        wamidHmac: hmacHex('3EB0AVISO', chaves.hmac),
        status: 'delivered',
      }),
    ]);
  });

  it('payload fora do formato: 200 (reenviar não conserta), sem nada na fila', async () => {
    expect((await post({ evento: 'x' })).statusCode).toBe(200);
    expect(
      (await post(envelope('messages.upsert', { key: { id: 1 }, message: {} }))).statusCode,
    ).toBe(200);
    expect(await jobs()).toEqual([]);
  });

  it('um canal por implantação: com a Evolution, o webhook da Meta não existe', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/webhook',
      query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify', 'hub.challenge': '7' },
    });
    expect(res.statusCode).toBe(404);
  });
});
