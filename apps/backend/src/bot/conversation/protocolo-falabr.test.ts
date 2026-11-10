import { caminhos, eq, estudantes, papeisPauta, pautas, type Db } from '@lumens/db';
import { calcularPrazo, diaEmMaceio } from '@lumens/dominio';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { segredoCom } from '../../cripto';
import { LOST_OWNER_TEXT } from './minhas-pautas';
import { hashPhone } from './phone';
import {
  ASK_DATE_TEXT,
  ASK_PROTOCOL_TEXT,
  DATE_FUTURE_TEXT,
  DATE_INVALID_TEXT,
  PROTOCOL_INVALID_TEXT,
  diaInformado,
  protocolAlreadySavedText,
  protocolSavedText,
} from './protocolo-falabr';
import type { MensagemDeBotoes, MensagemDeLista, Resposta } from './resposta';
import { handleIncoming } from './router';
import { ConversationStore } from './store';

const CHAVE = Buffer.alloc(32, 7);
const H = hashPhone('5582999990000', CHAVE);
const segredo = segredoCom(CHAVE);
const PROTOCOLO = '00106.000123/2026-11';

let db: Db;
let store: ConversationStore;
let pautaId: string;

const send = (text: string) => handleIncoming({ phoneHmac: H, text }, { store, db, segredo });
const passo = async () => (await store.get(H))?.step;
const falabr = async () =>
  (await db.select().from(caminhos).where(eq(caminhos.pautaId, pautaId))).find(
    (c) => c.tipo === 'falabr',
  );

/** Os ids das opções do estado dos caminhos, venham em botões ou em lista. */
function opcoesEm(respostas: Resposta[]): string[] {
  const achada = respostas.find(
    (r): r is MensagemDeBotoes | MensagemDeLista => typeof r !== 'string',
  );
  if (!achada) throw new Error(`nenhuma opção em ${JSON.stringify(respostas)}`);
  return achada.tipo === 'botoes' ? achada.botoes.map((b) => b.id) : achada.linhas.map((l) => l.id);
}

beforeEach(async () => {
  db = await criarBancoEmMemoria();
  store = new ConversationStore(db);
  const [eu] = await db
    .insert(estudantes)
    .values({ telefoneHmac: H, telefoneCifrado: 'x', verificadoEm: new Date() })
    .returning({ id: estudantes.id });
  if (!eu) throw new Error('estudante não inserido');
  const [pauta] = await db
    .insert(pautas)
    .values({
      slug: 'bebedouro',
      titulo: 'Bebedouro do bloco 18',
      descricao: 'Descrição da pauta.',
      categoria: 'infraestrutura',
      status: 'meta_batida',
      meta: 30,
    })
    .returning({ id: pautas.id });
  if (!pauta) throw new Error('pauta não inserida');
  pautaId = pauta.id;
  await db.insert(papeisPauta).values({ pautaId, estudanteId: eu.id, papel: 'owner' });
  await send('oi');
  await send('4');
  await send('caminho:falabr');
}, 60_000);

describe('registrar o protocolo pelo bot (3.4)', () => {
  it('número e dia: grava, calcula o prazo dos 30+30 e leva a pauta a cobrando', async () => {
    expect(await send('protocolo:falabr')).toEqual([ASK_PROTOCOL_TEXT]);
    expect(await passo()).toBe('OWNER_ASK_PROTOCOL');

    expect(await send(`  ${PROTOCOLO} `)).toEqual([ASK_DATE_TEXT]);
    expect(await passo()).toBe('OWNER_ASK_PROTOCOL_DATE');

    const r = await send('01/11/2026');

    expect(r[0]).toBe(protocolSavedText(PROTOCOLO, '2026-12-01'));
    expect(await falabr()).toMatchObject({ protocolo: PROTOCOLO, prazo: '2026-12-01' });
    const [pauta] = await db.select().from(pautas).where(eq(pautas.id, pautaId));
    expect(pauta?.status).toBe('cobrando');
    // Com protocolo, texto e registro somem, e entra o envio da resposta (3.6); a comunidade
    // continua disponível.
    expect(opcoesEm(r)).toEqual(['caminho:comunidade', 'resposta:falabr', 'menu']);
    expect(await passo()).toBe('OWNER_PATHS');
  });

  it('"hoje" conta o prazo a partir de hoje', async () => {
    await send('protocolo:falabr');
    await send(PROTOCOLO);

    await send('hoje');

    const esperado = calcularPrazo({ abertoEm: diaEmMaceio(new Date()) }).vence;
    expect((await falabr())?.prazo).toBe(esperado);
  });

  it('também atende ao pedido digitado', async () => {
    expect(await send('Registrar protocolo')).toEqual([ASK_PROTOCOL_TEXT]);
  });

  it('resposta sem número não é protocolo: pergunta de novo', async () => {
    await send('protocolo:falabr');

    expect(await send('não sei ainda')).toEqual([PROTOCOL_INVALID_TEXT]);
    expect(await passo()).toBe('OWNER_ASK_PROTOCOL');
  });

  it.each([
    ['dia que não existe', '31/02/2026', DATE_INVALID_TEXT],
    ['texto que não é data', 'semana passada', DATE_INVALID_TEXT],
    ['data que ainda não chegou', '01/01/2099', DATE_FUTURE_TEXT],
  ])('%s: pergunta o dia de novo e não grava', async (_caso, resposta, aviso) => {
    await send('protocolo:falabr');
    await send(PROTOCOLO);

    expect(await send(resposta)).toEqual([aviso]);
    expect(await passo()).toBe('OWNER_ASK_PROTOCOL_DATE');
    expect((await falabr())?.protocolo).toBeNull();
  });

  it('o mesmo protocolo mandado de novo é reconhecido, sem gravar de novo', async () => {
    // O primeiro registro já gravou; a pessoa repete a conversa com o mesmo número.
    await db
      .update(caminhos)
      .set({ protocolo: PROTOCOLO, prazo: '2026-12-01' })
      .where(eq(caminhos.pautaId, pautaId));
    await store.save(H, 'OWNER_ASK_PROTOCOL_DATE', {
      pautaId,
      caminhoId: (await falabr())?.id,
      protocolo: PROTOCOLO,
    });

    expect((await send('05/11/2026'))[0]).toBe(protocolAlreadySavedText(PROTOCOLO));
    // O prazo continua o do primeiro registro, não o da data repetida.
    expect((await falabr())?.prazo).toBe('2026-12-01');
  });

  it('quem deixou de ser owner no meio do registro não grava', async () => {
    await send('protocolo:falabr');
    await send(PROTOCOLO);
    await db.update(papeisPauta).set({ ate: new Date() }).where(eq(papeisPauta.pautaId, pautaId));

    expect((await send('hoje'))[0]).toBe(LOST_OWNER_TEXT);
    expect((await falabr())?.protocolo).toBeNull();
  });
});

describe('diaInformado', () => {
  // 10/11/2026, 12h em Maceió.
  const AGORA = new Date('2026-11-10T15:00:00.000Z');

  it.each([
    ['hoje', '2026-11-10'],
    ['Ontem', '2026-11-09'],
    ['01/11/2026', '2026-11-01'],
    ['1/11/26', '2026-11-01'],
    ['01-11', '2026-11-01'],
  ])('"%s" é %s', (resposta, dia) => {
    expect(diaInformado(resposta, AGORA)).toEqual({ dia, futuro: false });
  });

  it('data depois de hoje vem marcada como futura', () => {
    expect(diaInformado('11/11/2026', AGORA)).toEqual({ dia: '2026-11-11', futuro: true });
  });

  it.each(['31/02/2026', '2026-11-01', 'amanhã'])('"%s" não é data aceita', (resposta) => {
    expect(diaInformado(resposta, AGORA)).toBeUndefined();
  });
});
