import { conversas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { segredoCom } from '../../cripto';
import { MENU_TEXT } from './handlers';
import { hashPhone } from './phone';
import { textoDaResposta, type Resposta } from './resposta';
import { handleIncoming } from './router';
import { ConversationStore } from './store';
import {
  CODE_PENDING_TEXT,
  EMAIL_ACCEPTED_TEXT,
  EMAIL_FORMAT_TEXT,
  EMAIL_MANY_TEXT,
  EMAIL_MISSING_TEXT,
  EMAIL_NOT_UFAL_TEXT,
  EMAIL_QUESTION_TEXT,
} from './verificacao';

const CHAVE = Buffer.alloc(32, 7);
const H = hashPhone('5582999990000', CHAVE);
const segredo = segredoCom(CHAVE);

let db: Db;
let store: ConversationStore;

const send = (text: string) => handleIncoming({ phoneHmac: H, text }, { store, db, segredo });
const passo = async () => (await store.get(H))?.step;
const dados = async () => (await store.get(H))?.data ?? {};
const textos = (respostas: Resposta[]) => respostas.map(textoDaResposta).join('\n');

beforeEach(async () => {
  db = await criarBancoEmMemoria();
  store = new ConversationStore(db);
  await send('oi');
}, 60_000);

describe('pedir o e-mail institucional (SCRUM-134)', () => {
  it('a opção 3 do menu pergunta o e-mail da UFAL', async () => {
    expect(await send('3')).toEqual([EMAIL_QUESTION_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
  });

  it.each(['aluno@ufal.br', 'Joao.Silva@IC.ufal.br', 'meu email é ana@ctec.ufal.br.'])(
    'aceita %j e segue para o código',
    async (mensagem) => {
      await send('3');
      expect(await send(mensagem)).toEqual([EMAIL_ACCEPTED_TEXT, CODE_PENDING_TEXT]);
      expect(await passo()).toBe('VERIFY_ASK_CODE');
    },
  );

  it.each([
    ['aluno@gmail.com', EMAIL_NOT_UFAL_TEXT],
    ['aluno@ufal.br.com', EMAIL_NOT_UFAL_TEXT],
    ['aluno@xufal.br', EMAIL_NOT_UFAL_TEXT],
    ['não tenho', EMAIL_MISSING_TEXT],
    ['aluno@', EMAIL_FORMAT_TEXT],
    ['aluno@ufal.br e aluno@gmail.com', EMAIL_MANY_TEXT],
  ])('recusa %j e pergunta de novo', async (mensagem, resposta) => {
    await send('3');
    expect(await send(mensagem)).toEqual([resposta]);
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
    expect(await dados()).not.toHaveProperty('emailCifrado');
  });

  it('depois de recusar, aceita o e-mail certo', async () => {
    await send('3');
    await send('aluno@gmail.com');
    expect((await send('aluno@ufal.br'))[0]).toBe(EMAIL_ACCEPTED_TEXT);
    expect(await passo()).toBe('VERIFY_ASK_CODE');
  });

  it('guarda o e-mail normalizado e cifrado; nunca em claro nem nas respostas', async () => {
    await send('3');
    const respostas = await send('  Aluno.Teste@IC.UFAL.BR ');

    const { emailCifrado } = (await dados()) as { emailCifrado: string };
    expect(segredo.decifrar(emailCifrado)).toBe('aluno.teste@ic.ufal.br');
    expect(textos(respostas).toLowerCase()).not.toContain('aluno.teste');
    const linhas = await db.select().from(conversas);
    expect(JSON.stringify(linhas).toLowerCase()).not.toContain('aluno.teste');
  });

  it('vindo da pauta nova (2.6), mantém o pedido pendente', async () => {
    await send('2');
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
    await send('aluno@ufal.br');
    expect(await dados()).toMatchObject({ pendingCommand: { kind: 'nova-pauta' } });
  });

  it("'cancelar' no passo do e-mail volta ao menu sem guardar nada", async () => {
    await send('3');
    const respostas = await send('cancelar');
    expect(respostas.at(-1)).toBe(MENU_TEXT);
    expect(await passo()).toBe('MENU');
    expect(await dados()).not.toHaveProperty('emailCifrado');
  });
});
