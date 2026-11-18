/**
 * SCRUM-333: quem volta depois de a conversa expirar (24 h). A opção do menu mandada na volta é
 * atendida, e quem tem cadastro não recebe de novo o aviso de privacidade inteiro.
 */
import { estudantes, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { segredoCom } from '../../cripto/cifra';
import { GREETING_TEXT, MENU_TEXT, WELCOME_BACK_TEXT } from './handlers';
import { hashPhone } from './phone';
import { PRIVACY_NOTICE_TEXT } from './privacidade';
import { REPORT_PROMPT_TEXT } from './relato';
import { handleIncoming } from './router';
import { ConversationStore } from './store';
import { NEW_TITLE_TEXT } from './texto';

const CHAVE = Buffer.alloc(32, 9);
const H = hashPhone('5582999993330', CHAVE);
const HORA = 3_600_000;
const segredo = segredoCom(CHAVE);

let db: Db;
let store: ConversationStore;
let relogio: Date;

const send = (text: string) => handleIncoming({ phoneHmac: H, text }, { store, db, segredo });
const passo = async () => (await store.get(H))?.step;

/** Estudante verificado por este telefone, que conversou e sumiu por mais de 24 h. */
async function verificadoQueVoltou() {
  await db.insert(estudantes).values({
    telefoneHmac: H,
    telefoneCifrado: segredo.cifrar('5582999993330'),
    curso: 'Direito',
    verificadoEm: new Date('2026-10-01T12:00:00Z'),
  });
  await send('oi');
  relogio = new Date(relogio.getTime() + 25 * HORA);
  expect(await store.get(H)).toBeNull();
}

beforeEach(async () => {
  db = await criarBancoEmMemoria();
  relogio = new Date('2026-11-10T12:00:00Z');
  store = new ConversationStore(db, () => relogio);
}, 60_000);

describe('volta depois de 24 h (SCRUM-333)', () => {
  it('"2" na volta entra direto na pauta nova, sem saudação nem aviso', async () => {
    await verificadoQueVoltou();

    expect(await send('2')).toEqual([NEW_TITLE_TEXT]);
    expect(await passo()).toBe('NEW_ASK_TITLE');
  });

  it.each([
    ['1', REPORT_PROMPT_TEXT, 'REPORT_ASK_TEXT'],
    ['relatar', REPORT_PROMPT_TEXT, 'REPORT_ASK_TEXT'],
    ['Nova pauta', NEW_TITLE_TEXT, 'NEW_ASK_TITLE'],
  ])('"%s" na volta é atendido', async (texto, resposta, esperado) => {
    await verificadoQueVoltou();

    expect(await send(texto)).toEqual([resposta]);
    expect(await passo()).toBe(esperado);
  });

  it('outra mensagem na volta recebe a saudação curta e o menu, sem o aviso de privacidade', async () => {
    await verificadoQueVoltou();

    const respostas = await send('oi');
    expect(respostas).toEqual([WELCOME_BACK_TEXT, MENU_TEXT]);
    expect(respostas).not.toContain(PRIVACY_NOTICE_TEXT);
    expect(await passo()).toBe('MENU');
  });

  it('quem tem cadastro e ainda não se verificou também não recebe o aviso de novo', async () => {
    await db.insert(estudantes).values({
      telefoneHmac: H,
      telefoneCifrado: segredo.cifrar('5582999993330'),
    });

    expect(await send('oi')).toEqual([WELCOME_BACK_TEXT, MENU_TEXT]);
  });
});

describe('primeiro contato de verdade continua com o aviso (SCRUM-333)', () => {
  it('sem cadastro, "oi" recebe saudação, aviso e menu', async () => {
    expect(await send('oi')).toEqual([GREETING_TEXT, PRIVACY_NOTICE_TEXT, MENU_TEXT]);
  });

  it('sem cadastro, "1" é atendido, com o aviso de privacidade antes', async () => {
    expect(await send('1')).toEqual([PRIVACY_NOTICE_TEXT, REPORT_PROMPT_TEXT]);
    expect(await passo()).toBe('REPORT_ASK_TEXT');
  });

  it('quem saiu do Lumens volta a ser primeiro contato', async () => {
    await db.insert(estudantes).values({
      telefoneHmac: 'saiu:00000000-0000-0000-0000-000000000000',
      telefoneCifrado: 'saiu:00000000-0000-0000-0000-000000000000',
      saiuEm: new Date('2026-11-01T12:00:00Z'),
    });

    expect(await send('oi')).toEqual([GREETING_TEXT, PRIVACY_NOTICE_TEXT, MENU_TEXT]);
  });
});
