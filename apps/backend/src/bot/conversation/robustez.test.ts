/**
 * SCRUM-307: casos menores de robustez da conversa que não têm um fluxo só deles. O da proposta
 * que não decifra está em `minhas-pautas.test.ts`; o da foto no passo do PDF, em
 * `resposta-oficial.test.ts`.
 */
import type { Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { segredoCom } from '../../cripto/cifra';
import { PAUTA_NOT_FOUND_IN_FLOW_TEXT } from './comandos-do-site';
import { defaultHandlers, type HandlerRegistry, type StepContext } from './handlers';
import { hashPhone } from './phone';
import { NEED_TEXT_FOR_FILE, PHOTO_AS_FILE_TEXT, handleIncoming } from './router';
import type { Step } from './steps';
import { ConversationStore } from './store';

const CHAVE = Buffer.alloc(32, 7);
const H = hashPhone('5582999990307', CHAVE);
const segredo = segredoCom(CHAVE);
const ARQUIVO = { id: 'midia-1', mimeType: 'image/jpeg' };
const DADOS = { escrito: 'o que a pessoa já tinha escrito' };

let db: Db;
let store: ConversationStore;
let recebidos: string[];

/** Troca o handler dos passos por um espião: mostra se a mensagem chegou ao passo. */
const espiao = (passo: Step) => (ctx: StepContext) => {
  recebidos.push(ctx.input.text);
  return { next: passo, replies: ['passo atendeu'] };
};
const handlers: HandlerRegistry = {
  ...defaultHandlers,
  NEW_ASK_TITLE: espiao('NEW_ASK_TITLE'),
  NEW_ASK_PHOTO: espiao('NEW_ASK_PHOTO'),
  SUPPORT_ASK_PHOTO: espiao('SUPPORT_ASK_PHOTO'),
};

const send = (text: string, document?: typeof ARQUIVO) =>
  handleIncoming(
    { phoneHmac: H, text, ...(document ? { document } : {}) },
    { store, db, segredo, handlers },
  );
const conversa = () => store.get(H);

beforeEach(async () => {
  db = await criarBancoEmMemoria();
  store = new ConversationStore(db);
  recebidos = [];
}, 60_000);

describe('arquivo no passo da foto (SCRUM-307)', () => {
  it.each(['NEW_ASK_PHOTO', 'SUPPORT_ASK_PHOTO'] as const)(
    'em %s, a foto mandada como documento pede para mandar como foto',
    async (passo) => {
      await store.save(H, passo, DADOS);

      expect(await send('', ARQUIVO)).toEqual([PHOTO_AS_FILE_TEXT]);
      expect(recebidos).toEqual([]);
      expect(await conversa()).toMatchObject({ step: passo, data: DADOS });
    },
  );

  it('fora dos passos da foto e do PDF, o arquivo continua pedindo texto', async () => {
    await store.save(H, 'NEW_ASK_TITLE', DADOS);

    expect(await send('', ARQUIVO)).toEqual([NEED_TEXT_FOR_FILE]);
    expect(recebidos).toEqual([]);
  });
});

describe('"apoiar <endereço que não existe>" no meio de um fluxo (SCRUM-307)', () => {
  it.each(['apoiar', 'cuidar'])(
    '"%s pauta-que-nao-existe" no passo da foto avisa e deixa a conversa como estava',
    async (comando) => {
      await store.save(H, 'SUPPORT_ASK_PHOTO', DADOS);

      expect(await send(`${comando} pauta-que-nao-existe`)).toEqual([PAUTA_NOT_FOUND_IN_FLOW_TEXT]);
      expect(recebidos).toEqual([]);
      expect(await conversa()).toMatchObject({ step: 'SUPPORT_ASK_PHOTO', data: DADOS });
    },
  );

  it('texto sem a forma de endereço ("apoiar estudantes") continua sendo a resposta ao passo', async () => {
    await store.save(H, 'NEW_ASK_TITLE', DADOS);

    expect(await send('Apoiar estudantes')).toEqual(['passo atendeu']);
    expect(recebidos).toEqual(['Apoiar estudantes']);
  });
});
