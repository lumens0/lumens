import { mensagensProcessadas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { pino } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decifrar, hmacHex, type Chaves } from '../../cripto/cifra';
import { FakeQueue, mensagensNaFila, prepararFilaFalsa } from '../../infra/queue.fake';
import { hashPhone } from '../conversation/phone';
import { conteudoDoJob } from '../webhook/process';
import { inputOf } from '../worker';
import {
  AVISO_SEM_RESPOSTA_TEXT,
  chaveDoChat,
  comandoDoStart,
  jobDoTelegram,
  mensagemDoUpdate,
  processarUpdate,
  updateSchema,
  type ResultadoDoUpdate,
} from './update';

const chaves: Chaves = { cifra: Buffer.alloc(32, 1), hmac: Buffer.alloc(32, 2) };
const CHAT = 123456789;
const silencioso = pino({ level: 'silent' });

const chatPrivado = { id: CHAT, type: 'private' };

function mensagem(extra: object, chat: object = chatPrivado) {
  return {
    update_id: 1000,
    message: { message_id: 7, date: 1700000000, chat, from: { id: CHAT, is_bot: false }, ...extra },
  };
}

function mapear(bruto: unknown): ResultadoDoUpdate {
  return mensagemDoUpdate(updateSchema.parse(bruto));
}

/** O texto que a conversa recebe: o mesmo caminho do worker (`inputOf`). */
function textoDaConversa(bruto: unknown): string | undefined {
  const r = mapear(bruto);
  if (r.tipo !== 'mensagem') throw new Error(`ignorado: ${r.motivo}`);
  return inputOf(r.mensagem.conteudo)?.text;
}

describe('mensagemDoUpdate', () => {
  it('texto vira texto, com o chat, o update_id e a data', () => {
    const r = mapear(mensagem({ text: 'oi' }));
    expect(r).toEqual({
      tipo: 'mensagem',
      mensagem: {
        updateId: 1000,
        chatId: CHAT,
        type: 'text',
        timestamp: '1700000000',
        conteudo: { text: { body: 'oi' } },
      },
    });
  });

  it('/start sem payload abre o menu', () => {
    expect(textoDaConversa(mensagem({ text: '/start' }))).toBe('menu');
  });

  it.each([
    ['/start apoiar_bebedouro-quebrado-bloco-b', 'apoiar bebedouro-quebrado-bloco-b'],
    ['/start ajudar_luz-do-corredor', 'ajudar luz-do-corredor'],
    ['/start nova', 'nova pauta'],
    ['/start@LumensBot nova', 'nova pauta'],
  ])('%s vira o comando do link do WhatsApp (%s)', (texto, esperado) => {
    expect(textoDaConversa(mensagem({ text: texto }))).toBe(esperado);
  });

  it('o comando do /start é o mesmo que o router entende como "ajudar <slug>"', async () => {
    const { parseAjudar } = await import('../conversation/proposta');
    expect(parseAjudar(comandoDoStart('ajudar_luz-do-corredor'))).toBe('luz-do-corredor');
  });

  it('payload desconhecido abre o menu em vez de virar resposta', () => {
    expect(comandoDoStart('xyz')).toBe('menu');
    expect(comandoDoStart('apoiar')).toBe('menu');
  });

  it('texto que só começa com /start não é o comando', () => {
    expect(textoDaConversa(mensagem({ text: '/startx' }))).toBe('/startx');
  });

  it('botão tocado vira o texto do callback_data e guarda o id para responder', () => {
    const r = mapear({
      update_id: 1001,
      callback_query: {
        id: 'cb-1',
        from: { id: CHAT },
        data: 'pauta:123',
        message: { message_id: 9, chat: chatPrivado, date: 1700000000 },
      },
    });
    expect(r.tipo).toBe('mensagem');
    if (r.tipo !== 'mensagem') return;
    expect(r.mensagem).toMatchObject({ chatId: CHAT, updateId: 1001, callbackQueryId: 'cb-1' });
    expect(inputOf(r.mensagem.conteudo)).toEqual({ text: 'pauta:123' });
  });

  it('foto vira image com o file_id da maior resolução; a legenda não vira texto', () => {
    const r = mapear(
      mensagem({
        caption: 'olha isso',
        photo: [
          { file_id: 'pequena', width: 90, height: 90, file_size: 1000 },
          { file_id: 'grande', width: 1280, height: 960, file_size: 90000 },
          { file_id: 'media', width: 320, height: 240, file_size: 9000 },
        ],
      }),
    );
    if (r.tipo !== 'mensagem') throw new Error('ignorado');
    expect(r.mensagem.type).toBe('image');
    expect(inputOf(r.mensagem.conteudo)).toEqual({
      text: '',
      image: { id: 'grande', mimeType: 'image/jpeg' },
    });
  });

  it('documento vira document com o file_id e o tipo', () => {
    const r = mapear(
      mensagem({
        document: { file_id: 'doc-1', mime_type: 'application/pdf', file_name: 'x.pdf' },
      }),
    );
    if (r.tipo !== 'mensagem') throw new Error('ignorado');
    expect(inputOf(r.mensagem.conteudo)).toEqual({
      text: '',
      document: { id: 'doc-1', mimeType: 'application/pdf' },
    });
  });

  it('figurinha chega sem conteúdo (o worker responde que só entende texto)', () => {
    const r = mapear(mensagem({ sticker: { file_id: 's' } }));
    if (r.tipo !== 'mensagem') throw new Error('ignorado');
    expect(inputOf(r.mensagem.conteudo)).toBeNull();
  });

  it('ignora grupo, supergrupo e canal', () => {
    for (const type of ['group', 'supergroup', 'channel']) {
      expect(mapear(mensagem({ text: 'oi' }, { id: -100, type }))).toMatchObject({
        tipo: 'ignorado',
        motivo: 'chat',
      });
    }
  });

  it('ignora botão tocado num grupo, mas guarda o id para parar o spinner', () => {
    expect(
      mapear({
        update_id: 1,
        callback_query: { id: 'cb-9', data: 'x', message: { chat: { id: -5, type: 'group' } } },
      }),
    ).toEqual({ tipo: 'ignorado', motivo: 'chat', callbackQueryId: 'cb-9' });
  });

  it('ignora mensagem de bot e update sem message nem callback (edição, enquete)', () => {
    expect(mapear(mensagem({ text: 'oi', from: { id: 1, is_bot: true } }))).toMatchObject({
      tipo: 'ignorado',
    });
    expect(mapear({ update_id: 5, edited_message: { text: 'oi' } })).toMatchObject({
      tipo: 'ignorado',
      motivo: 'tipo de update',
    });
  });
});

describe('jobDoTelegram', () => {
  it('a chave é o HMAC de tg:<chat_id>, e o chat id vai cifrado', () => {
    const r = mapear(mensagem({ text: 'oi' }));
    if (r.tipo !== 'mensagem') throw new Error('ignorado');
    const job = jobDoTelegram(r.mensagem, chaves);
    expect(job).toMatchObject({
      phoneHmac: hashPhone(`tg:${String(CHAT)}`, chaves.hmac),
      wamidHmac: hmacHex('tg:1000', chaves.hmac),
      type: 'text',
      timestamp: '1700000000',
    });
    // Não colide com um telefone de mesmos dígitos no WhatsApp.
    expect(job.phoneHmac).not.toBe(hashPhone(String(CHAT), chaves.hmac));
    expect(job.phoneHmac).toBe(chaveDoChat(CHAT, chaves));
    expect(decifrar(job.phoneCifrado, chaves.cifra)).toBe(String(CHAT));
    expect(conteudoDoJob(job, chaves)).toEqual({ text: { body: 'oi' } });
  });
});

describe('processarUpdate', () => {
  let db: Db;
  let queue: FakeQueue;
  const chamar = vi.fn(() => Promise.resolve(true));

  beforeEach(async () => {
    db = await criarBancoEmMemoria();
    await prepararFilaFalsa(db);
    queue = new FakeQueue();
    chamar.mockClear();
  }, 20_000);

  const deps = () => ({ db, queue, logger: silencioso, chaves, api: { chamar: chamar as never } });

  it('enfileira uma vez; o mesmo update_id de novo é duplicado', async () => {
    const update = mensagem({ text: 'oi' });
    expect(await processarUpdate(update, deps())).toBe('enfileirada');
    expect(await processarUpdate(update, deps())).toBe('duplicada');
    const fila = await mensagensNaFila(db);
    expect(fila).toHaveLength(1);
    expect(fila[0]?.data.phoneHmac).toBe(chaveDoChat(CHAT, chaves));
    expect(queue.chaves).toEqual([chaveDoChat(CHAT, chaves)]);
    expect(await db.select().from(mensagensProcessadas)).toEqual([
      expect.objectContaining({ wamidHmac: hmacHex('tg:1000', chaves.hmac) }),
    ]);
  });

  it('o dedup do Telegram não colide com um wamid de mesmo texto', async () => {
    await db.insert(mensagensProcessadas).values({ wamidHmac: hmacHex('1000', chaves.hmac) });
    expect(await processarUpdate(mensagem({ text: 'oi' }), deps())).toBe('enfileirada');
  });

  it('falha da fila lança e não grava o dedup (o reenvio passa)', async () => {
    queue.failSend = true;
    await expect(processarUpdate(mensagem({ text: 'oi' }), deps())).rejects.toThrow();
    expect(await db.select().from(mensagensProcessadas)).toHaveLength(0);
    queue.failSend = false;
    expect(await processarUpdate(mensagem({ text: 'oi' }), deps())).toBe('enfileirada');
  });

  it('responde o botão tocado com answerCallbackQuery', async () => {
    await processarUpdate(
      {
        update_id: 2,
        callback_query: { id: 'cb-1', data: 'menu', message: { chat: chatPrivado } },
      },
      deps(),
    );
    expect(chamar).toHaveBeenCalledWith('answerCallbackQuery', { callback_query_id: 'cb-1' });
  });

  it('resposta rápida de um aviso não vai para a conversa: o botão é respondido com um aviso', async () => {
    // Nenhum fluxo lê `tipo:aviso:i` ainda; como texto, viraria resposta à pergunta em aberto.
    const data = 'conferencia:0b9c1f9e-8d2e-4c39-9a51-2f6f3a1d7c10:0';
    const update = {
      update_id: 3,
      callback_query: { id: 'cb-2', data, message: { chat: chatPrivado } },
    };

    expect(await processarUpdate(update, deps())).toBe('ignorada');
    expect(await mensagensNaFila(db)).toHaveLength(0);
    expect(chamar).toHaveBeenCalledWith('answerCallbackQuery', {
      callback_query_id: 'cb-2',
      text: AVISO_SEM_RESPOSTA_TEXT,
    });
    // O id de um botão da conversa que só se parece com o payload continua indo para a conversa.
    expect(
      textoDaConversa({
        ...update,
        callback_query: { ...update.callback_query, data: 'caminho:falabr' },
      }),
    ).toBe('caminho:falabr');
  });

  it('update fora do formato e chat de grupo não enfileiram nada', async () => {
    expect(await processarUpdate({ foo: 1 }, deps())).toBe('invalida');
    expect(await processarUpdate(mensagem({ text: 'oi' }, { id: -1, type: 'group' }), deps())).toBe(
      'ignorada',
    );
    expect(await mensagensNaFila(db)).toHaveLength(0);
  });
});
