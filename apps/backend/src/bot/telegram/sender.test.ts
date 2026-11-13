import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { cifrar, type Chaves } from '../../cripto/cifra';
import { CAMPUS_ROW_ID, listaDeBlocos } from '../conversation/blocos';
import {
  PROTOCOL_BUTTON_ID,
  RESPONSE_BUTTON_ID,
  TEXT_BUTTON_ID,
} from '../conversation/minhas-pautas';
import { BOTAO_PROPOR, botaoFeita } from '../conversation/proposta';
import { listaDeParecidas, OTHER_ROW_ID } from '../conversation/relato';
import { botoes, lista, type Resposta } from '../conversation/resposta';
import { PRIVACY_NOTICE_TEXT } from '../conversation/privacidade';
import { listaDeCursos } from '../conversation/verificacao';
import type { OutgoingReplies } from '../worker';
import { ErroDaApiDoTelegram } from './api';
import {
  LIMITE_DO_CALLBACK_BYTES,
  LIMITE_DO_TEXTO,
  dividirTexto,
  paraTelegram,
  telegramSender,
} from './sender';

const chaves: Chaves = { cifra: Buffer.alloc(32, 1), hmac: Buffer.alloc(32, 2) };
const CHAT = 42;

describe('paraTelegram', () => {
  it('texto vira um sendMessage simples, sem parse_mode', () => {
    expect(paraTelegram('oi', CHAT)).toEqual([{ chat_id: CHAT, text: 'oi' }]);
  });

  it('o *negrito* do WhatsApp vira entity, sem os asteriscos e sem parse_mode', () => {
    const [envio] = paraTelegram(PRIVACY_NOTICE_TEXT, CHAT);

    expect(envio?.text).not.toContain('*');
    expect(envio).not.toHaveProperty('parse_mode');
    const negritos = (envio?.entities ?? []).map((e) =>
      envio?.text.slice(e.offset, e.offset + e.length),
    );
    expect(negritos).toEqual(['Sua privacidade no Lumens', 'sair']);
  });

  it('o negrito sobrevive à divisão em várias mensagens', () => {
    const texto = `${'a'.repeat(LIMITE_DO_TEXTO - 2)}\nResponda *menu*.`;
    const envios = paraTelegram(texto, CHAT);

    expect(envios).toHaveLength(2);
    expect(envios[0]).not.toHaveProperty('entities');
    expect(envios[1]).toEqual({
      chat_id: CHAT,
      text: 'Responda menu.',
      entities: [{ type: 'bold', offset: 9, length: 4 }],
    });
  });

  it('botões: corpo e um botão inline por linha, callback_data = id', () => {
    const resposta = botoes({
      corpo: 'Quer juntar?',
      botoes: [
        { id: 'sim', titulo: 'Sim' },
        { id: 'menu', titulo: 'Voltar ao menu' },
      ],
    });
    expect(paraTelegram(resposta, CHAT)).toEqual([
      {
        chat_id: CHAT,
        text: 'Quer juntar?',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Sim', callback_data: 'sim' }],
            [{ text: 'Voltar ao menu', callback_data: 'menu' }],
          ],
        },
      },
    ]);
  });

  it('lista: um botão por linha e as descrições como texto do corpo', () => {
    const resposta = lista({
      corpo: 'Alguma destas?',
      botao: 'Ver pautas',
      linhas: [
        { id: 'pauta:1', titulo: 'Bebedouro', descricao: 'Sem água no bloco B' },
        { id: 'outro', titulo: 'É outro problema' },
      ],
    });
    const [envio, ...resto] = paraTelegram(resposta, CHAT);
    expect(resto).toHaveLength(0);
    expect(envio?.text).toBe('Alguma destas?\n\n• Bebedouro: Sem água no bloco B');
    expect(envio?.reply_markup?.inline_keyboard).toEqual([
      [{ text: 'Bebedouro', callback_data: 'pauta:1' }],
      [{ text: 'É outro problema', callback_data: 'outro' }],
    ]);
  });

  it('lista sem descrição manda só o corpo', () => {
    const resposta = lista({ corpo: 'Qual?', botao: 'Ver', linhas: [{ id: 'a', titulo: 'A' }] });
    expect(paraTelegram(resposta, CHAT)[0]?.text).toBe('Qual?');
  });

  it('texto longo é dividido; os botões vão só na última parte', () => {
    const corpo = `${'a'.repeat(4000)}\n${'b'.repeat(200)}`;
    const resposta: Resposta = { tipo: 'botoes', corpo, botoes: [{ id: 'x', titulo: 'X' }] };
    const envios = paraTelegram(resposta, CHAT);
    expect(envios.map((e) => e.text.length)).toEqual([4000, 200]);
    expect(envios[0]?.reply_markup).toBeUndefined();
    expect(envios[1]?.reply_markup?.inline_keyboard).toEqual([[{ text: 'X', callback_data: 'x' }]]);
  });

  it('id que passa de 64 bytes lança em vez de mandar uma mensagem que o Telegram recusa', () => {
    const resposta: Resposta = {
      tipo: 'botoes',
      corpo: 'x',
      botoes: [{ id: 'é'.repeat(33), titulo: 'X' }],
    };
    expect(() => paraTelegram(resposta, CHAT)).toThrow(/callback_data/);
  });
});

describe('dividirTexto', () => {
  it('não divide o que cabe', () => {
    expect(dividirTexto('a'.repeat(LIMITE_DO_TEXTO))).toHaveLength(1);
  });

  it('sem quebra de linha corta no limite, sem partir emoji', () => {
    const texto = `${'a'.repeat(9)}😀bbb`;
    const partes = dividirTexto(texto, 10);
    expect(partes).toEqual(['a'.repeat(9), '😀bbb']);
    expect(partes.join('')).toBe(texto);
  });

  it('nenhuma parte passa do limite', () => {
    const texto = Array.from(
      { length: 300 },
      (_, i) => `linha ${String(i)} ${'x'.repeat(40)}`,
    ).join('\n');
    for (const parte of dividirTexto(texto))
      expect(parte.length).toBeLessThanOrEqual(LIMITE_DO_TEXTO);
  });
});

describe('os ids que a conversa usa cabem no callback_data', () => {
  const uuid = randomUUID();
  const bytes = (id: string) => Buffer.byteLength(id, 'utf8');

  it.each([
    ['curso (todas as linhas da lista)', listaDeCursos().linhas.map((l) => l.id)],
    ['bloco', listaDeBlocos([{ id: uuid, slug: 'b', nome: 'Bloco B' }]).linhas.map((l) => l.id)],
    [
      'pauta parecida',
      listaDeParecidas([{ id: uuid, titulo: 't', descricao: 'd' }]).linhas.map((l) => l.id),
    ],
    ['pauta das minhas pautas', [`pauta:${uuid}`]],
    ['ajudar <proposta>', [`ajudar ${uuid}`]],
    ['proposta feita', [botaoFeita(uuid)]],
    [
      'constantes',
      [
        CAMPUS_ROW_ID,
        OTHER_ROW_ID,
        TEXT_BUTTON_ID,
        PROTOCOL_BUTTON_ID,
        RESPONSE_BUTTON_ID,
        BOTAO_PROPOR,
        'caminho:falabr',
        'caminho:comunidade',
        'menu',
      ],
    ],
  ])('%s', (_nome, ids) => {
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(bytes(id), id).toBeLessThanOrEqual(LIMITE_DO_CALLBACK_BYTES);
  });
});

describe('telegramSender', () => {
  const mensagem = (respostas: Resposta[]): OutgoingReplies => ({
    phoneHmac: 'h'.repeat(64),
    phoneCifrado: cifrar(String(CHAT), chaves.cifra),
    phoneNumberId: 'telegram',
    wamidHmac: 'w',
    repliesCifradas: cifrar(JSON.stringify(respostas), chaves.cifra),
  });
  const criar = (chamar: (metodo: string, params?: object) => Promise<unknown>) => {
    const esperar = vi.fn(() => Promise.resolve());
    const sender = telegramSender({
      api: { chamar: chamar as never },
      chaves,
      logger: pino({ level: 'silent' }),
      esperar,
    });
    return { sender, esperar };
  };

  it('manda as respostas em ordem para o chat decifrado', async () => {
    const chamar = vi.fn((_m: string, _p?: object) => Promise.resolve({}));
    const { sender } = criar(chamar);
    await sender.send(mensagem(['um', 'dois']));
    expect(chamar.mock.calls).toEqual([
      ['sendMessage', { chat_id: CHAT, text: 'um' }],
      ['sendMessage', { chat_id: CHAT, text: 'dois' }],
    ]);
  });

  it('bloqueado pela pessoa (403): descarta o resto sem lançar', async () => {
    const chamar = vi.fn(() =>
      Promise.reject(
        new ErroDaApiDoTelegram('sendMessage', 403, 'Forbidden: bot was blocked by the user'),
      ),
    );
    const { sender } = criar(chamar);
    await expect(sender.send(mensagem(['um', 'dois']))).resolves.toBeUndefined();
    expect(chamar).toHaveBeenCalledTimes(1);
  });

  it.each([['Bad Request: chat not found'], ['Bad Request: Chat Not Found']])(
    'chat inexistente (400 "%s"): descarta o resto sem lançar',
    async (descricao) => {
      const chamar = vi.fn(() =>
        Promise.reject(new ErroDaApiDoTelegram('sendMessage', 400, descricao)),
      );
      const { sender } = criar(chamar);
      await expect(sender.send(mensagem(['um', 'dois']))).resolves.toBeUndefined();
      expect(chamar).toHaveBeenCalledTimes(1);
    },
  );

  it('outro 400 (defeito da mensagem) lança, para o job chegar à fila de mortas', async () => {
    const chamar = vi.fn(() =>
      Promise.reject(
        new ErroDaApiDoTelegram(
          'sendMessage',
          400,
          "Bad Request: can't parse entities: Can't find end of the entity",
        ),
      ),
    );
    const { sender } = criar(chamar);
    await expect(sender.send(mensagem(['um', 'dois']))).rejects.toThrow('400');
    expect(chamar).toHaveBeenCalledTimes(1);
  });

  it('429: espera o retry_after e reenvia a mesma mensagem', async () => {
    const chamar = vi
      .fn()
      .mockRejectedValueOnce(new ErroDaApiDoTelegram('sendMessage', 429, 'Too Many Requests', 7))
      .mockResolvedValue({});
    const { sender, esperar } = criar(chamar);
    await sender.send(mensagem(['um']));
    expect(esperar).toHaveBeenCalledWith(7000);
    expect(chamar).toHaveBeenCalledTimes(2);
  });

  it('429 com espera longa demais volta ao retry da fila', async () => {
    const chamar = vi.fn(() =>
      Promise.reject(new ErroDaApiDoTelegram('sendMessage', 429, 'Too Many Requests', 3600)),
    );
    const { sender, esperar } = criar(chamar);
    await expect(sender.send(mensagem(['um']))).rejects.toBeInstanceOf(ErroDaApiDoTelegram);
    expect(esperar).not.toHaveBeenCalled();
  });

  describe('card da pauta (2.9)', () => {
    const CARD: Resposta = {
      tipo: 'imagem',
      url: 'https://lumens-ufal.vercel.app/p/bebedouros/card.png?apoios=3',
      legenda: 'Compartilhe para juntar mais apoios: https://lumens-ufal.vercel.app/p/bebedouros',
    };

    it('vai como sendPhoto, com o link da imagem e a legenda, entre as outras respostas', async () => {
      const chamar = vi.fn((_m: string, _p?: object) => Promise.resolve({}));
      const { sender } = criar(chamar);
      await sender.send(mensagem(['apoiou', CARD, 'relato?']));
      expect(chamar.mock.calls).toEqual([
        ['sendMessage', { chat_id: CHAT, text: 'apoiou' }],
        ['sendPhoto', { chat_id: CHAT, photo: CARD.url, caption: CARD.legenda }],
        ['sendMessage', { chat_id: CHAT, text: 'relato?' }],
      ]);
    });

    it.each([
      [
        'o Telegram não consegue baixar o card (400)',
        new ErroDaApiDoTelegram('sendPhoto', 400, 'Bad Request: failed to get HTTP URL content'),
      ],
      ['o Telegram está instável (5xx)', new ErroDaApiDoTelegram('sendPhoto', 502, 'Bad Gateway')],
    ])('%s: vai só a legenda, com o link, e a conversa segue', async (_caso, erro) => {
      const chamar = vi.fn((metodo: string, _p?: object) =>
        metodo === 'sendPhoto' ? Promise.reject(erro) : Promise.resolve({}),
      );
      const { sender } = criar(chamar);
      await expect(sender.send(mensagem([CARD, 'relato?']))).resolves.toBeUndefined();
      expect(chamar.mock.calls.slice(1)).toEqual([
        ['sendMessage', { chat_id: CHAT, text: CARD.legenda }],
        ['sendMessage', { chat_id: CHAT, text: 'relato?' }],
      ]);
    });

    it('bloqueado pela pessoa no card: não tenta o link nem o resto', async () => {
      const chamar = vi.fn(() =>
        Promise.reject(
          new ErroDaApiDoTelegram('sendPhoto', 403, 'Forbidden: bot was blocked by the user'),
        ),
      );
      const { sender } = criar(chamar);
      await expect(sender.send(mensagem([CARD, 'relato?']))).resolves.toBeUndefined();
      expect(chamar).toHaveBeenCalledTimes(1);
    });
  });

  it('erro passageiro (5xx, rede) lança para o retry do pg-boss', async () => {
    const chamar = vi.fn(() =>
      Promise.reject(new ErroDaApiDoTelegram('sendMessage', 502, 'Bad Gateway')),
    );
    const { sender } = criar(chamar);
    await expect(sender.send(mensagem(['um']))).rejects.toThrow('502');
  });
});
