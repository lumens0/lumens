import { chatsTelegram, mensagensProcessadas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { pino } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decifrar, hmacHex, type Chaves } from '../../cripto/cifra';
import {
  FakeQueue,
  mensagensNaFila,
  prepararFilaFalsa,
  respostasNaFila,
} from '../../infra/queue.fake';
import { hashPhone } from '../conversation/phone';
import { conteudoDoJob, processWebhookPayload } from '../webhook/process';
import { inputOf, respostasDoJob } from '../worker';
import {
  CONTATO_ACEITO_TEXT,
  CONTATO_ALHEIO_TEXT,
  CONTATO_ILEGIVEL_TEXT,
  normalizarTelefone,
  PEDIR_CONTATO_TEXT,
} from './contato';
import {
  AVISO_SEM_RESPOSTA_TEXT,
  chaveDoChat,
  comandoDoStart,
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
  if (r.tipo !== 'mensagem') throw new Error(`não é mensagem: ${r.tipo}`);
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

  it('contato vira contato; só é "próprio" com user_id igual ao from.id', () => {
    const contato = (extra: object) =>
      mapear(mensagem({ contact: { phone_number: '+5582999990000', ...extra } }));
    expect(contato({ user_id: CHAT })).toEqual({
      tipo: 'contato',
      contato: {
        updateId: 1000,
        chatId: CHAT,
        timestamp: '1700000000',
        telefone: '+5582999990000',
        proprio: true,
      },
    });
    expect(contato({ user_id: 1 })).toMatchObject({ contato: { proprio: false } });
    expect(contato({})).toMatchObject({ contato: { proprio: false } });
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

describe('chaveDoChat', () => {
  it('é o HMAC de tg:<chat_id>, que não colide com o hashPhone de mesmos dígitos', () => {
    expect(chaveDoChat(CHAT, chaves)).toBe(hmacHex(`tg:${String(CHAT)}`, chaves.hmac));
    expect(chaveDoChat(CHAT, chaves)).not.toBe(hashPhone(String(CHAT), chaves.hmac));
  });
});

describe('normalizarTelefone', () => {
  it.each([
    ['+5582999990000', '5582999990000'],
    ['5582999990000', '5582999990000'],
    ['+55 (82) 99999-0000', '5582999990000'],
  ])('%s vira %s, a forma do from da Meta', (bruto, esperado) => {
    expect(normalizarTelefone(bruto)).toBe(esperado);
  });

  it('fora de 8 a 15 dígitos não é telefone', () => {
    expect(normalizarTelefone('+123')).toBeNull();
    expect(normalizarTelefone('1234567890123456')).toBeNull();
    expect(normalizarTelefone('abc')).toBeNull();
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

  let proximoUpdate = 2000;
  /** Um update com `update_id` novo (o dedup engoliria a repetição). */
  const novo = <T extends object>(update: T): T & { update_id: number } => ({
    ...update,
    update_id: ++proximoUpdate,
  });
  /** `null`: o cartão sem `user_id`. */
  const contato = (telefone: string, userId: number | null = CHAT) =>
    novo(
      mensagem({
        contact: {
          phone_number: telefone,
          first_name: 'Maria',
          ...(userId === null ? {} : { user_id: userId }),
        },
      }),
    );
  const botao = (data: string) =>
    novo({
      callback_query: { id: 'cb-1', from: { id: CHAT }, data, message: { chat: chatPrivado } },
    });

  /** As respostas de antes da conversa, decifradas, com o teclado e o chat de cada job. */
  const respostas = async () =>
    (await respostasNaFila(db)).map(({ data }) => ({
      textos: respostasDoJob(data, chaves),
      teclado: data.teclado,
      chat: data.chatCifrado === undefined ? undefined : decifrar(data.chatCifrado, chaves.cifra),
    }));
  const textosNaConversa = async () =>
    (await mensagensNaFila(db)).map(({ data }) => conteudoDoJob(data, chaves).text?.body);

  it('com o mesmo telefone, o chat é a mesma pessoa do WhatsApp (mesmo phoneHmac)', async () => {
    // O caminho da Meta: o `from` é o wa_id, só dígitos.
    const meta = await processWebhookPayload(
      {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'PNID' },
                  messages: [
                    {
                      id: 'wamid.X',
                      from: '5582999990000',
                      timestamp: '1700000000',
                      type: 'text',
                      text: { body: 'oi' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      deps(),
    );
    expect(meta.enqueued).toBe(1);

    expect(await processarUpdate(contato('+5582999990000'), deps())).toBe('contato_aceito');
    expect(await processarUpdate(novo(mensagem({ text: 'oi' })), deps())).toBe('enfileirada');

    const [doWhatsapp, ...doTelegram] = (await mensagensNaFila(db)).map((j) => j.data);
    expect(doWhatsapp?.canal).toBe('whatsapp');
    expect(doTelegram).toHaveLength(2);
    for (const job of doTelegram) {
      expect(job.canal).toBe('telegram');
      expect(job.phoneHmac).toBe(doWhatsapp?.phoneHmac);
      expect(decifrar(job.phoneCifrado, chaves.cifra)).toBe('5582999990000');
      expect(decifrar(job.chatCifrado ?? '', chaves.cifra)).toBe(String(CHAT));
    }
    // A fila da conversa é a mesma: a chave de ordem é o telefone.
    expect(queue.chaves.filter((c) => c !== undefined)).toEqual([
      doWhatsapp?.phoneHmac,
      doWhatsapp?.phoneHmac,
      doWhatsapp?.phoneHmac,
    ]);
  });

  it.each([['+5582999990000'], ['5582999990000']])(
    'contato %s: o telefone é guardado só como HMAC e cifra',
    async (telefone) => {
      await processarUpdate(contato(telefone), deps());
      const [chat] = await db.select().from(chatsTelegram);
      expect(chat?.chatHmac).toBe(chaveDoChat(CHAT, chaves));
      expect(chat?.telefoneHmac).toBe(hashPhone('5582999990000', chaves.hmac));
      expect(decifrar(chat?.telefoneCifrado ?? '', chaves.cifra)).toBe('5582999990000');
      expect(decifrar(chat?.chatCifrado ?? '', chaves.cifra)).toBe(String(CHAT));
      expect(JSON.stringify(chat)).not.toContain('99999');
    },
  );

  it.each([
    ['de outra pessoa (user_id diferente do from.id)', 999],
    ['sem user_id (cartão da agenda)', null],
  ])('contato %s é recusado e o pedido se repete', async (_, userId) => {
    expect(await processarUpdate(contato('5582988887777', userId), deps())).toBe(
      'contato_recusado',
    );
    expect(await mensagensNaFila(db)).toEqual([]);
    expect(await db.select().from(chatsTelegram)).toEqual([]);
    expect(await respostas()).toEqual([
      { textos: [CONTATO_ALHEIO_TEXT], teclado: 'pedirContato', chat: String(CHAT) },
    ]);
  });

  it('contato com número ilegível é recusado', async () => {
    expect(await processarUpdate(contato('+12'), deps())).toBe('contato_recusado');
    expect(await respostas()).toEqual([
      { textos: [CONTATO_ILEGIVEL_TEXT], teclado: 'pedirContato', chat: String(CHAT) },
    ]);
    expect(await mensagensNaFila(db)).toEqual([]);
  });

  it.each([
    ['texto', () => novo(mensagem({ text: 'oi' }))],
    ['link do site (/start)', () => novo(mensagem({ text: '/start apoiar_bebedouro' }))],
    ['botão antigo', () => botao('menu')],
    ['foto', () => novo(mensagem({ photo: [{ file_id: 'f', width: 1, height: 1 }] }))],
    ['documento', () => novo(mensagem({ document: { file_id: 'd' } }))],
  ])('chat sem contato (%s): pede o contato e nada vai para a conversa', async (_, update) => {
    expect(await processarUpdate(update(), deps())).toBe('contato_pedido');
    expect(await mensagensNaFila(db)).toEqual([]);
    expect(await respostas()).toEqual([
      { textos: [PEDIR_CONTATO_TEXT], teclado: 'pedirContato', chat: String(CHAT) },
    ]);
  });

  it('o botão de um chat sem contato também para de girar', async () => {
    await processarUpdate(botao('menu'), deps());
    expect(chamar).toHaveBeenCalledWith('answerCallbackQuery', { callback_query_id: 'cb-1' });
  });

  it('o link do site que chegou antes do contato roda depois dele', async () => {
    await processarUpdate(novo(mensagem({ text: '/start apoiar_bebedouro-quebrado' })), deps());
    await processarUpdate(novo(mensagem({ photo: [{ file_id: 'f' }] })), deps());
    // O comando guardado vai cifrado.
    const [guardado] = await db.select().from(chatsTelegram);
    expect(guardado?.comandoPendenteCifrado).not.toContain('bebedouro');

    expect(await processarUpdate(contato('5582999990000'), deps())).toBe('contato_aceito');

    expect(await textosNaConversa()).toEqual(['apoiar bebedouro-quebrado']);
    // Confirma o número e recolhe o teclado do contato.
    expect((await respostas()).at(-1)).toEqual({
      textos: [CONTATO_ACEITO_TEXT],
      teclado: 'tirarTeclado',
      chat: String(CHAT),
    });
    expect((await db.select().from(chatsTelegram))[0]?.comandoPendenteCifrado).toBeNull();
  });

  it('sem nada guardado, o contato abre o menu; o próximo texto vai direto', async () => {
    await processarUpdate(contato('5582999990000'), deps());
    await processarUpdate(novo(mensagem({ text: 'oi' })), deps());
    expect(await textosNaConversa()).toEqual(['menu', 'oi']);
  });

  it('enfileira uma vez; o mesmo update_id de novo é duplicado', async () => {
    await processarUpdate(contato('5582999990000'), deps());
    const update = novo(mensagem({ text: 'oi' }));
    expect(await processarUpdate(update, deps())).toBe('enfileirada');
    expect(await processarUpdate(update, deps())).toBe('duplicada');
    expect(await textosNaConversa()).toEqual(['menu', 'oi']);
    expect(await db.select().from(mensagensProcessadas)).toContainEqual(
      expect.objectContaining({
        wamidHmac: hmacHex(`tg:${String(update.update_id)}`, chaves.hmac),
      }),
    );
  });

  it('o dedup do Telegram não colide com um wamid de mesmo texto', async () => {
    const update = novo(mensagem({ text: 'oi' }));
    await db
      .insert(mensagensProcessadas)
      .values({ wamidHmac: hmacHex(String(update.update_id), chaves.hmac) });
    expect(await processarUpdate(update, deps())).toBe('contato_pedido');
  });

  it('falha da fila lança e não grava nada (o reenvio passa)', async () => {
    queue.failSend = true;
    const update = contato('5582999990000');
    await expect(processarUpdate(update, deps())).rejects.toThrow();
    expect(await db.select().from(mensagensProcessadas)).toHaveLength(0);
    expect(await db.select().from(chatsTelegram)).toHaveLength(0);
    queue.failSend = false;
    expect(await processarUpdate(update, deps())).toBe('contato_aceito');
  });

  it('responde o botão tocado com answerCallbackQuery', async () => {
    await processarUpdate(contato('5582999990000'), deps());
    expect(await processarUpdate(botao('menu'), deps())).toBe('enfileirada');
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

  it('update fora do formato, chat de grupo e contato num grupo não enfileiram nada', async () => {
    const grupo = { id: -1, type: 'group' };
    expect(await processarUpdate({ foo: 1 }, deps())).toBe('invalida');
    expect(await processarUpdate(mensagem({ text: 'oi' }, grupo), deps())).toBe('ignorada');
    const contatoNoGrupo = mensagem(
      { contact: { phone_number: '5582999990000', user_id: CHAT } },
      grupo,
    );
    expect(await processarUpdate(novo(contatoNoGrupo), deps())).toBe('ignorada');
    expect(await mensagensNaFila(db)).toHaveLength(0);
    expect(await respostasNaFila(db)).toHaveLength(0);
  });
});
