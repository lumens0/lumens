/**
 * SCRUM-343: depois do apoio, o "sim" à pergunta "Quer contar o que você viu?" não é o relato. Ele
 * pede o texto, e o texto seguinte vira o relato. Relato de uma ou duas palavras pede mais detalhe.
 */
import { estudantes, eq, pautas, relatos, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { segredoCom } from '../../cripto/cifra';
import {
  ASK_WRITE_REPORT_TEXT,
  SUPPORT_DONE_TEXT,
  SUPPORT_PHOTO_ASK_TEXT,
  SUPPORT_REPORT_TOO_SHORT_TEXT,
  WRITE_REPORT_TEXT,
} from './apoio';
import { hashPhone } from './phone';
import { handleIncoming } from './router';
import { ConversationStore } from './store';

const CHAVE = Buffer.alloc(32, 3);
const H = hashPhone('5582999993430', CHAVE);
const segredo = segredoCom(CHAVE);
const RELATO = 'Na minha turma de quinta o ar também não funcionou.';

let db: Db;
let store: ConversationStore;
let pautaId: string;

const send = (text: string) => handleIncoming({ phoneHmac: H, text }, { store, db, segredo });
const passo = async () => (await store.get(H))?.step;
const textosDosRelatos = async () =>
  (await db.select().from(relatos).where(eq(relatos.pautaId, pautaId))).map((r) => r.texto);

beforeEach(async () => {
  db = await criarBancoEmMemoria();
  store = new ConversationStore(db);
  await db
    .insert(estudantes)
    .values({ telefoneHmac: H, telefoneCifrado: 'x', verificadoEm: new Date() });
  const [pauta] = await db
    .insert(pautas)
    .values({
      slug: 'ar-condicionado',
      titulo: 'Ar-condicionado das salas',
      descricao: 'Consertar o ar das salas de aula.',
      categoria: 'infraestrutura',
      status: 'juntando_apoios',
      meta: 30,
    })
    .returning({ id: pautas.id });
  if (!pauta) throw new Error('pauta não inserida');
  pautaId = pauta.id;
  // Logo depois do apoio pelo link do site: a pergunta do relato, sem relato da 2.5.
  await store.save(H, 'SUPPORT_ASK_REPORT', { apoioPautaId: pautaId });
}, 60_000);

describe('relato depois do apoio (SCRUM-343)', () => {
  it('"sim" não grava relato, e o texto seguinte vira o relato', async () => {
    expect(await send('sim')).toEqual([WRITE_REPORT_TEXT]);
    expect(await passo()).toBe('SUPPORT_ASK_REPORT');
    expect((await store.get(H))?.data.relatoCifrado).toBeUndefined();

    expect(await send(RELATO)).toContain(SUPPORT_PHOTO_ASK_TEXT);
    await send('pular');

    expect(await textosDosRelatos()).toEqual([RELATO]);
  });

  it.each(['Sim!', 's', 'quero', 'pode', 'claro', 'quero contar'])(
    '"%s" também pede o texto, sem gravar nada',
    async (resposta) => {
      expect(await send(resposta)).toEqual([WRITE_REPORT_TEXT]);
      expect(await passo()).toBe('SUPPORT_ASK_REPORT');
      expect(await textosDosRelatos()).toEqual([]);
    },
  );

  it.each(['não', 'n', 'pular'])('"%s" encerra sem relato', async (resposta) => {
    expect(await send(resposta)).toContain(SUPPORT_DONE_TEXT);
    expect(await textosDosRelatos()).toEqual([]);
  });

  it.each(['quebrado', 'ar quebrado', 'ok!'])(
    'relato curto demais ("%s") pede mais detalhe e não grava',
    async (curto) => {
      expect(await send(curto)).toEqual([SUPPORT_REPORT_TOO_SHORT_TEXT]);
      expect(await passo()).toBe('SUPPORT_ASK_REPORT');

      expect(await send('o ar da sala 3 não liga')).toContain(SUPPORT_PHOTO_ASK_TEXT);
      await send('pular');
      expect(await textosDosRelatos()).toEqual(['o ar da sala 3 não liga']);
    },
  );

  it('a pergunta pede o texto direto e ensina a pular', () => {
    expect(ASK_WRITE_REPORT_TEXT).toContain('Escreva numa mensagem o que aconteceu e onde');
    expect(ASK_WRITE_REPORT_TEXT).toContain('*pular*');
    expect(SUPPORT_REPORT_TOO_SHORT_TEXT).toContain('*pular*');
  });
});
