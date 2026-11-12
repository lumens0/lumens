import { chatsTelegram, conversas, eq, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { criarEstudanteVerificado } from '../teste/fabricas';
import {
  CHAT_SEM_CONTATO_EXPIRA_MS,
  apagarChatTelegram,
  apagarChatsSemContato,
  chatTelegramDe,
  guardarComandoPendente,
  vincularChatTelegram,
} from './chat-telegram';
import { sairDoLumens } from './sair';

let db: Db;

beforeEach(async () => {
  db = await criarBancoEmMemoria();
});

const AGORA = new Date('2026-11-12T12:00:00.000Z');

const vincular = (chat: string, telefone: string) =>
  vincularChatTelegram(db, {
    chatHmac: chat,
    chatCifrado: `c-${chat}`,
    telefoneHmac: telefone,
    telefoneCifrado: `t-${telefone}`,
    agora: AGORA,
  });

describe('chat do Telegram (SCRUM-267)', () => {
  it('guarda o comando antes do contato; o contato liga o telefone e tira o comando', async () => {
    await guardarComandoPendente(db, { chatHmac: 'a', chatCifrado: 'ca', comandoCifrado: 'p1' });
    await guardarComandoPendente(db, { chatHmac: 'a', chatCifrado: 'ca', comandoCifrado: 'p2' });
    expect(await chatTelegramDe(db, 'a')).toEqual({
      chatCifrado: 'ca',
      telefoneHmac: null,
      telefoneCifrado: null,
      comandoPendenteCifrado: 'p2',
    });

    await vincular('a', 'tel');
    expect(await chatTelegramDe(db, 'a')).toEqual({
      chatCifrado: 'c-a',
      telefoneHmac: 'tel',
      telefoneCifrado: 't-tel',
      comandoPendenteCifrado: null,
    });
  });

  it('chat já ligado não guarda comando pendente', async () => {
    await vincular('a', 'tel');
    await guardarComandoPendente(db, { chatHmac: 'a', chatCifrado: 'ca', comandoCifrado: 'p' });
    expect((await chatTelegramDe(db, 'a'))?.comandoPendenteCifrado).toBeNull();
  });

  it('um telefone, um chat: o último a compartilhar fica com ele', async () => {
    await vincular('antigo', 'tel');
    await vincular('novo', 'tel');
    expect(await chatTelegramDe(db, 'antigo')).toBeUndefined();
    expect((await chatTelegramDe(db, 'novo'))?.telefoneHmac).toBe('tel');
  });

  it('apagarChatTelegram tira só o chat daquele telefone', async () => {
    await vincular('a', 'tel-a');
    await vincular('b', 'tel-b');
    expect(await apagarChatTelegram(db, 'tel-a')).toBe(true);
    expect(await apagarChatTelegram(db, 'tel-a')).toBe(false);
    expect(await chatTelegramDe(db, 'a')).toBeUndefined();
    expect(await chatTelegramDe(db, 'b')).toBeDefined();
  });

  it('a limpeza apaga só chat sem contato parado há mais de um dia', async () => {
    const velho = new Date(AGORA.getTime() - CHAT_SEM_CONTATO_EXPIRA_MS - 1);
    await guardarComandoPendente(db, {
      chatHmac: 'velho',
      chatCifrado: 'c',
      comandoCifrado: 'p',
      agora: velho,
    });
    await guardarComandoPendente(db, {
      chatHmac: 'recente',
      chatCifrado: 'c',
      comandoCifrado: 'p',
      agora: AGORA,
    });
    await vincularChatTelegram(db, {
      chatHmac: 'ligado',
      chatCifrado: 'c',
      telefoneHmac: 'tel',
      telefoneCifrado: 't',
      agora: velho,
    });

    expect(await apagarChatsSemContato(db, AGORA)).toBe(1);
    expect((await db.select().from(chatsTelegram)).map((c) => c.chatHmac).sort()).toEqual([
      'ligado',
      'recente',
    ]);
  });

  it('sair do Lumens apaga o chat ligado ao telefone', async () => {
    const estudante = await criarEstudanteVerificado(db);
    await vincular('chat', estudante.telefoneHmac);
    await vincular('outro', 'outro-telefone');
    await db.insert(conversas).values({ telefoneHmac: estudante.telefoneHmac, passo: 'MENU' });

    await db.transaction((tx) => sairDoLumens(tx, { estudanteId: estudante.id, agora: AGORA }));

    expect(await chatTelegramDe(db, 'chat')).toBeUndefined();
    expect(await chatTelegramDe(db, 'outro')).toBeDefined();
    expect(
      await db.select().from(conversas).where(eq(conversas.telefoneHmac, estudante.telefoneHmac)),
    ).toEqual([]);
  });
});
