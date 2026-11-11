import { apoios, codigosVerificacao, conversas, eq, estudantes, pautas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { registrarApoio } from '@lumens/dominio';
import { beforeEach, describe, expect, it } from 'vitest';
import { hmacHex, segredoCom } from '../../cripto/cifra';
import type { ServicoDeEmail } from '../../email/codigo';
import { estudanteVerificado } from './estudante';
import { GREETING_TEXT, MENU_TEXT } from './handlers';
import { hashPhone } from './phone';
import {
  LEAVE_CONFIRM_TEXT,
  LEFT_TEXT,
  NOTHING_TO_DELETE_TEXT,
  PRIVACY_NOTICE_TEXT,
  STAYED_TEXT,
} from './privacidade';
import { handleIncoming } from './router';
import { ConversationStore } from './store';

// História 5.7 (SCRUM-115): aviso no primeiro contato e comando "sair" chamando sairDoLumens.

const CHAVE = Buffer.alloc(32, 7);
const H = hashPhone('5582999990000', CHAVE);
const segredo = segredoCom(CHAVE);

let db: Db;
let store: ConversationStore;
// Como o worker: cada mensagem numa transação, para o savepoint do sairDoLumens valer.
// E-mail falso: a verificação (2.4) grava o código e "envia" sem SMTP.
const email: ServicoDeEmail = { enviarCodigo: () => Promise.resolve(true) };
const hmac = (valor: string) => hmacHex(valor, CHAVE);
const send = (text: string) =>
  db.transaction((tx) =>
    handleIncoming(
      { phoneHmac: H, text },
      { store: store.withDb(tx), db: tx, segredo, email, hmac },
    ),
  );

const codigoPendente = async () =>
  (await db.select().from(codigosVerificacao).where(eq(codigosVerificacao.telefoneHmac, H)))[0];

const conversa = async () =>
  (await db.select().from(conversas).where(eq(conversas.telefoneHmac, H)))[0];

async function estudanteComApoio(): Promise<{ estudanteId: string; pautaId: string }> {
  const [estudante] = await db
    .insert(estudantes)
    .values({ telefoneHmac: H, telefoneCifrado: 'x', curso: 'Direito', verificadoEm: new Date() })
    .returning({ id: estudantes.id });
  const [pauta] = await db
    .insert(pautas)
    .values({
      slug: 'pauta-apoiada',
      titulo: 'Pauta apoiada',
      descricao: 'Descrição.',
      categoria: 'infraestrutura',
      status: 'juntando_apoios',
      meta: 300,
    })
    .returning({ id: pautas.id });
  if (estudante === undefined || pauta === undefined) throw new Error('fixture não criada');
  await db.transaction((tx) =>
    registrarApoio(tx, { pautaId: pauta.id, estudanteId: estudante.id, origem: 'bot' }),
  );
  return { estudanteId: estudante.id, pautaId: pauta.id };
}

const apoiosDa = async (pautaId: string) =>
  (await db.select().from(apoios).where(eq(apoios.pautaId, pautaId))).length;

beforeEach(async () => {
  db = await criarBancoEmMemoria();
  store = new ConversationStore(db);
}, 20_000);

describe('aviso de privacidade (SCRUM-175)', () => {
  it('o primeiro contato mostra o aviso entre a saudação e o menu', async () => {
    expect(await send('oi')).toEqual([GREETING_TEXT, PRIVACY_NOTICE_TEXT, MENU_TEXT]);
  });

  it('só no primeiro contato: a mensagem seguinte não repete o aviso', async () => {
    await send('oi');
    expect(await send('menu')).toEqual([MENU_TEXT]);
  });

  it('primeira mensagem que é comando global também leva o aviso', async () => {
    expect(await send('menu')).toEqual([PRIVACY_NOTICE_TEXT, MENU_TEXT]);
  });

  it('o aviso diz como sair e onde está a política completa', () => {
    expect(PRIVACY_NOTICE_TEXT).toContain('*sair*');
    expect(PRIVACY_NOTICE_TEXT).toContain('/privacidade');
  });

  it('o aviso diz a base legal e quando a pessoa consente (SCRUM-174)', () => {
    expect(PRIVACY_NOTICE_TEXT).toContain('LGPD, art. 7º, I');
    expect(PRIVACY_NOTICE_TEXT).toContain('Ao se verificar, você concorda');
  });
});

describe("comando 'sair' (SCRUM-176)", () => {
  it('sem cadastro, não há o que confirmar: apaga a conversa', async () => {
    await send('oi');
    expect(await send('sair')).toEqual([NOTHING_TO_DELETE_TEXT]);
    expect(await conversa()).toBeUndefined();
  });

  it('sem cadastro, apaga também o código de verificação pedido e não usado', async () => {
    await send('oi');
    await send('3');
    await send('aluno@ufal.br');
    expect(await codigoPendente()).toBeDefined();
    expect((await db.select().from(estudantes).where(eq(estudantes.telefoneHmac, H))).length).toBe(
      0,
    );

    expect(await send('sair')).toEqual([NOTHING_TO_DELETE_TEXT]);
    expect(await codigoPendente()).toBeUndefined();
    expect(await conversa()).toBeUndefined();
  });

  it('com cadastro, pede confirmação antes de sair', async () => {
    await estudanteComApoio();
    await send('oi');
    expect(await send('SAIR')).toEqual([LEAVE_CONFIRM_TEXT]);
    expect((await conversa())?.passo).toBe('LEAVE_CONFIRM');
  });

  it('confirmado: apaga o vínculo do telefone e os apoios continuam contando', async () => {
    const { estudanteId, pautaId } = await estudanteComApoio();
    await send('oi');
    await send('sair');

    expect(await send('sim')).toEqual([LEFT_TEXT]);

    const [linha] = await db.select().from(estudantes).where(eq(estudantes.id, estudanteId));
    expect(linha?.saiuEm).not.toBeNull();
    expect(linha?.telefoneHmac).not.toBe(H);
    expect(await estudanteVerificado(db, H)).toBeUndefined();
    expect(await apoiosDa(pautaId)).toBe(1);
    expect(await conversa()).toBeUndefined();
  });

  it('depois de sair, a próxima mensagem é primeiro contato de novo', async () => {
    await estudanteComApoio();
    await send('oi');
    await send('sair');
    await send('sim');
    expect(await send('oi')).toEqual([GREETING_TEXT, PRIVACY_NOTICE_TEXT, MENU_TEXT]);
  });

  it('qualquer outra resposta cancela e volta ao menu sem mexer no cadastro', async () => {
    const { estudanteId } = await estudanteComApoio();
    await send('oi');
    await send('sair');

    expect(await send('não')).toEqual([STAYED_TEXT, MENU_TEXT]);
    expect((await conversa())?.passo).toBe('MENU');
    expect(await estudanteVerificado(db, H)).toBe(estudanteId);
  });

  it('funciona no meio de outro fluxo', async () => {
    await estudanteComApoio();
    await send('oi');
    await send('1'); // relatar problema
    expect(await send('sair')).toEqual([LEAVE_CONFIRM_TEXT]);
    expect(await send('sim')).toEqual([LEFT_TEXT]);
    expect(await estudanteVerificado(db, H)).toBeUndefined();
  });
});
