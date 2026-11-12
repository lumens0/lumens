import { readFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { updateSchema } from '../telegram/update';
import { FIXTURES_DIR, fixtures } from './fixtures';
import {
  DEFAULT_CHAT_ID,
  buildTelegramCallback,
  buildTelegramDocument,
  buildTelegramPhoto,
  buildTelegramStart,
  buildTelegramText,
  proximoUpdateId,
  sendTelegram,
  urlPadraoTelegram,
} from './telegram';

/** Valida com o schema real do bot: o simulador não pode mandar o que o webhook descartaria. */
function parse(update: unknown) {
  const r = updateSchema.safeParse(update);
  if (!r.success) throw new Error(`update fora do schema: ${JSON.stringify(r.error.issues)}`);
  return r.data;
}

describe('construtores de Update do Telegram', () => {
  it('texto: chat privado, from = chat', () => {
    const u = parse(buildTelegramText({ text: 'buraco no bloco 12', chatId: 42, updateId: 7 }));
    expect(u.update_id).toBe(7);
    expect(u.message).toMatchObject({
      chat: { id: 42, type: 'private' },
      from: { id: 42, is_bot: false },
      text: 'buraco no bloco 12',
    });
    expect(u.callback_query).toBeUndefined();
  });

  it('/start sem e com payload', () => {
    expect(parse(buildTelegramStart({})).message?.text).toBe('/start');
    expect(parse(buildTelegramStart({ payload: 'apoiar_bebedouro' })).message?.text).toBe(
      '/start apoiar_bebedouro',
    );
  });

  it('botão inline vira callback_query com data e a mensagem do chat', () => {
    const u = parse(buildTelegramCallback({ data: 'cat_iluminacao', chatId: 42 }));
    expect(u.message).toBeUndefined();
    expect(u.callback_query).toMatchObject({
      data: 'cat_iluminacao',
      from: { id: 42 },
      message: { chat: { id: 42, type: 'private' } },
    });
    expect(u.callback_query?.id).not.toBe('');
  });

  it('foto em vários tamanhos, com e sem legenda', () => {
    const a = parse(buildTelegramPhoto({ caption: 'poste apagado' })).message;
    expect(a?.photo?.length).toBeGreaterThan(1);
    expect(a?.caption).toBe('poste apagado');
    expect(parse(buildTelegramPhoto({})).message?.caption).toBeUndefined();
  });

  it('documento com mime_type', () => {
    const m = parse(buildTelegramDocument({ mimeType: 'application/pdf' })).message;
    expect(m?.document).toMatchObject({ mime_type: 'application/pdf' });
    expect(m?.document?.file_id).not.toBe('');
  });

  it('chat padrão quando não informado', () => {
    expect(parse(buildTelegramText({ text: 'oi' })).message?.chat.id).toBe(DEFAULT_CHAT_ID);
  });

  it('update_id novo a cada envio (o dedup não engole repetições)', () => {
    const ids = [
      buildTelegramText({ text: 'oi' }).update_id,
      buildTelegramText({ text: 'oi' }).update_id,
      buildTelegramCallback({ data: 'x' }).update_id,
      proximoUpdateId(),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(Number.isSafeInteger(id)).toBe(true);
  });
});

describe('destino padrão no canal Telegram', () => {
  it.each([
    [undefined, 'http://localhost:3001/telegram/webhook'],
    ['', 'http://localhost:3001/telegram/webhook'],
    ['8080', 'http://localhost:8080/telegram/webhook'],
  ])('PORT=%j → %s', (porta, url) => {
    expect(urlPadraoTelegram(porta)).toBe(url);
  });
});

describe('envio ao webhook do Telegram', () => {
  it('sendTelegram manda o header do segredo e o update como JSON', async () => {
    let got: { headers: IncomingHttpHeaders; raw: Buffer; method: string; url: string } | undefined;
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        got = {
          headers: req.headers,
          raw: Buffer.concat(chunks),
          method: req.method ?? '',
          url: req.url ?? '',
        };
        res.writeHead(200).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const { port } = server.address() as AddressInfo;
      const update = buildTelegramText({ text: 'acentuação ✓', updateId: 99 });
      const res = await sendTelegram(update, {
        url: `http://127.0.0.1:${String(port)}/telegram/webhook`,
        secret: 'segredo_123',
      });
      expect(res.status).toBe(200);
      if (!got) throw new Error('o servidor não recebeu a requisição');
      expect(got.method).toBe('POST');
      expect(got.url).toBe('/telegram/webhook');
      expect(got.headers['content-type']).toBe('application/json');
      expect(got.headers['x-telegram-bot-api-secret-token']).toBe('segredo_123');
      expect(got.headers['x-hub-signature-256']).toBeUndefined();
      expect(JSON.parse(got.raw.toString('utf8'))).toEqual(update);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});

describe('fixtures do Telegram', () => {
  const telegram = Object.entries(fixtures()).filter(([nome]) => nome.startsWith('telegram-'));

  it('cobrem os updates que o bot trata', () => {
    expect(telegram.map(([nome]) => nome).sort()).toEqual([
      'telegram-botao',
      'telegram-documento',
      'telegram-foto',
      'telegram-start',
      'telegram-start-apoiar',
      'telegram-texto',
    ]);
  });

  for (const [nome] of telegram) {
    it(`${nome}.json passa no updateSchema`, () => {
      parse(JSON.parse(readFileSync(join(FIXTURES_DIR, `${nome}.json`), 'utf8')));
    });
  }
});
