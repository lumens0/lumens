import {
  caminhos,
  documentosResposta,
  eq,
  estudantes,
  papeisPauta,
  pautas,
  type Db,
} from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { segredoCom } from '../../cripto/cifra';
import type { ResultadoPdf, ServicoDeRespostas } from '../../fotos/resposta-pdf';
import { LOST_OWNER_TEXT } from './minhas-pautas';
import { hashPhone } from './phone';
import {
  ASK_PDF_TEXT,
  NEED_PDF_TEXT,
  NO_PROTOCOL_TEXT,
  PDF_RECEIVED_TEXT,
  PDF_REFUSED_TEXT,
} from './resposta-oficial';
import { handleIncoming, NEED_TEXT_FOR_FILE } from './router';
import { ConversationStore } from './store';

const CHAVE = Buffer.alloc(32, 7);
const H = hashPhone('5582999990000', CHAVE);
const segredo = segredoCom(CHAVE);
const PDF = { id: 'midia-pdf', mimeType: 'application/pdf' };

let db: Db;
let store: ConversationStore;
let pautaId: string;
let caminhoId: string;
let resultadoDoPdf: ResultadoPdf;
let guardados: string[];

const respostas: ServicoDeRespostas = {
  guardarPdf: (midia) => {
    guardados.push(midia.id);
    return Promise.resolve(resultadoDoPdf);
  },
};

const send = (text: string, document?: { id: string; mimeType: string }) =>
  handleIncoming(
    { phoneHmac: H, text, ...(document ? { document } : {}) },
    { store, db, segredo, respostas },
  );
const passo = async () => (await store.get(H))?.step;
const documentos = () =>
  db.select().from(documentosResposta).where(eq(documentosResposta.pautaId, pautaId));

beforeEach(async () => {
  db = await criarBancoEmMemoria();
  store = new ConversationStore(db);
  guardados = [];
  resultadoDoPdf = { ok: true, chave: 'respostas/2026/11/abc.pdf' };
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
      status: 'cobrando',
      meta: 30,
    })
    .returning({ id: pautas.id });
  if (!pauta) throw new Error('pauta não inserida');
  pautaId = pauta.id;
  await db.insert(papeisPauta).values({ pautaId, estudanteId: eu.id, papel: 'owner' });
  const [caminho] = await db
    .insert(caminhos)
    .values({ pautaId, tipo: 'falabr', status: 'aberto', protocolo: 'OUV-1', prazo: '2026-12-01' })
    .returning({ id: caminhos.id });
  if (!caminho) throw new Error('caminho não inserido');
  caminhoId = caminho.id;
  await send('oi');
  await send('4');
}, 60_000);

describe('owner encaminha o PDF da resposta oficial (3.6)', () => {
  it('com protocolo, o botão pede o PDF; o PDF é guardado e registrado no caminho', async () => {
    expect(await send('resposta:falabr')).toEqual([ASK_PDF_TEXT]);
    expect(await passo()).toBe('OWNER_SEND_RESPONSE');

    const r = await send('', PDF);

    expect(r[0]).toBe(PDF_RECEIVED_TEXT);
    expect(guardados).toEqual(['midia-pdf']);
    const [doc] = await documentos();
    expect(doc).toMatchObject({ caminhoId, arquivoChave: 'respostas/2026/11/abc.pdf' });
    expect(await passo()).toBe('OWNER_PATHS');
  });

  it('também atende ao pedido digitado', async () => {
    expect(await send('enviar resposta')).toEqual([ASK_PDF_TEXT]);
  });

  it('texto no lugar do arquivo: pede o PDF de novo', async () => {
    await send('resposta:falabr');

    expect(await send('já mandei')).toEqual([NEED_PDF_TEXT]);
    expect(await passo()).toBe('OWNER_SEND_RESPONSE');
  });

  it.each([
    ['não é PDF', 'formato' as const],
    ['grande demais', 'tamanho' as const],
    ['storage fora do ar', 'indisponivel' as const],
  ])('arquivo recusado (%s): explica, não registra e espera outro', async (_caso, motivo) => {
    resultadoDoPdf = { ok: false, motivo };
    await send('resposta:falabr');

    expect(await send('', PDF)).toEqual([PDF_REFUSED_TEXT[motivo]]);
    expect(await documentos()).toHaveLength(0);
    expect(await passo()).toBe('OWNER_SEND_RESPONSE');
  });

  it('quem deixou de ser owner no meio do envio não registra', async () => {
    await send('resposta:falabr');
    await db.update(papeisPauta).set({ ate: new Date() }).where(eq(papeisPauta.pautaId, pautaId));

    expect((await send('', PDF))[0]).toBe(LOST_OWNER_TEXT);
    expect(await documentos()).toHaveLength(0);
  });

  it('sem protocolo ainda não há resposta para mandar', async () => {
    await db
      .update(caminhos)
      .set({ protocolo: null, prazo: null })
      .where(eq(caminhos.id, caminhoId));

    expect((await send('enviar resposta'))[0]).toBe(NO_PROTOCOL_TEXT);
  });

  it('arquivo fora do passo do PDF pede texto', async () => {
    expect(await send('', PDF)).toEqual([NEED_TEXT_FOR_FILE]);
    expect(guardados).toEqual([]);
  });
});
