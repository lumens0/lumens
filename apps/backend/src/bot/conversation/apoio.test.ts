import {
  apoios,
  blocos,
  conversas,
  disparos,
  eq,
  estudantes,
  eventos,
  pautas,
  relatos,
  sql,
  type Db,
} from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { RELATO_MAXIMO } from '@lumens/dominio';
import { beforeEach, describe, expect, it } from 'vitest';
import { segredoCom } from '../../cripto/cifra';
import type { ResultadoFoto, ServicoDeFotos } from '../../fotos/servico';
import {
  ASK_ATTACH_REPORT_TEXT,
  ASK_WRITE_REPORT_TEXT,
  REPORT_SENT_TEXT,
  REPORT_SENT_WITH_PHOTO_TEXT,
  SUPPORT_CLOSED_TEXT,
  SUPPORT_DONE_TEXT,
  SUPPORT_PHOTO_ASK_TEXT,
  SUPPORT_VERIFY_FIRST_TEXT,
  alreadySupportsText,
  goalReachedText,
  reportTooLongText,
  supportedText,
} from './apoio';
import { MENU_TEXT } from './handlers';
import { photoRefusedText } from './nova-pauta';
import { hashPhone } from './phone';
import { handleIncoming } from './router';
import { ConversationStore } from './store';

const CHAVE = Buffer.alloc(32, 7);
const H = hashPhone('5582999990000', CHAVE);
const segredo = segredoCom(CHAVE);
const RELATO = 'o bebedouro do bloco 18 ta quebrado de novo';
const TITULO = 'Bebedouros funcionando no Bloco 18';

let db: Db;
let store: ConversationStore;
let pautaId: string;

/** Serviço de fotos falso: devolve o que o teste mandar (o real é testado em `fotos/`). */
let resultadoDaFoto: ResultadoFoto;
const fotos: ServicoDeFotos = { guardarFoto: () => Promise.resolve(resultadoDaFoto) };

const send = (text: string) =>
  handleIncoming({ phoneHmac: H, text }, { store, db, segredo, fotos });
const sendFoto = () =>
  handleIncoming(
    { phoneHmac: H, text: '', image: { id: 'midia-1', mimeType: 'image/jpeg' } },
    { store, db, segredo, fotos },
  );
const passo = async () => (await store.get(H))?.step;
const dados = async () => (await store.get(H))?.data ?? {};
const apoiosDaPauta = () => db.select().from(apoios).where(eq(apoios.pautaId, pautaId));
const relatosDaPauta = () => db.select().from(relatos).where(eq(relatos.pautaId, pautaId));

async function verificar(telefoneHmac = H) {
  const [estudante] = await db
    .insert(estudantes)
    .values({ telefoneHmac, telefoneCifrado: 'x', verificadoEm: new Date() })
    .returning({ id: estudantes.id });
  if (!estudante) throw new Error('estudante não inserido');
  return estudante.id;
}

/** Relata o problema e escolhe a pauta parecida ("É essa"). */
async function escolherAPauta() {
  await send('1');
  await send(RELATO);
  return send(`pauta:${pautaId}`);
}

// Banco em memória novo + mensagens iniciais: no Windows, com os testes em paralelo, passa de 20s.
beforeEach(async () => {
  db = await criarBancoEmMemoria();
  store = new ConversationStore(db);
  const [b18] = await db
    .insert(blocos)
    .values({ slug: 'bloco-18', nome: 'Bloco 18', baseEstudantes: 1200 })
    .returning({ id: blocos.id });
  if (!b18) throw new Error('bloco não inserido');
  const [pauta] = await db
    .insert(pautas)
    .values({
      slug: 'bebedouros',
      titulo: TITULO,
      descricao: 'Consertar os bebedouros existentes do bloco.',
      blocoId: b18.id,
      categoria: 'infraestrutura',
      status: 'juntando_apoios',
      meta: 30,
    })
    .returning({ id: pautas.id });
  if (!pauta) throw new Error('pauta não inserida');
  pautaId = pauta.id;
  resultadoDaFoto = { ok: true, chave: 'fotos/2026/11/abc.jpg' };
  await send('oi');
}, 60_000);

describe('apoiar pela lista de parecidas (2.7)', () => {
  it('"É essa" registra o apoio, mostra o placar e oferece juntar o relato', async () => {
    await verificar();
    const respostas = await escolherAPauta();
    expect(respostas).toEqual([supportedText(TITULO, 1, 30), ASK_ATTACH_REPORT_TEXT]);
    expect(await apoiosDaPauta()).toHaveLength(1);
    expect((await apoiosDaPauta())[0]?.origem).toBe('bot');
    expect(await passo()).toBe('SUPPORT_ASK_REPORT');
    expect(await dados()).toMatchObject({ apoioPautaId: pautaId });
    expect(await dados()).not.toHaveProperty('parecidas');
  });

  it('o placar conta os apoios que a pauta já tinha', async () => {
    for (const n of [1, 2, 3]) {
      const outro = await verificar(`outro-${String(n)}`);
      await db.insert(apoios).values({ pautaId, estudanteId: outro, origem: 'site' });
    }
    await verificar();
    expect((await escolherAPauta())[0]).toBe(supportedText(TITULO, 4, 30));
  });

  it('apoio duplicado não conta de novo e avisa que a pessoa já apoia', async () => {
    const estudanteId = await verificar();
    await db.insert(apoios).values({ pautaId, estudanteId, origem: 'site' });
    const respostas = await escolherAPauta();
    expect(respostas[0]).toBe(alreadySupportsText(TITULO, 1, 30));
    expect(respostas[0]).toContain('Você já apoia esta pauta');
    expect(await apoiosDaPauta()).toHaveLength(1);
    // Mesmo quem já apoiava pode juntar um relato novo.
    expect(await passo()).toBe('SUPPORT_ASK_REPORT');
  });

  it('o apoio que bate a meta avisa a pessoa, grava o evento e põe o aviso na fila', async () => {
    await db.update(pautas).set({ meta: 1 }).where(eq(pautas.id, pautaId));
    await verificar();
    const respostas = await escolherAPauta();
    expect(respostas).toEqual([
      supportedText(TITULO, 1, 1),
      goalReachedText(1),
      ASK_ATTACH_REPORT_TEXT,
    ]);
    const tipos = (
      await db.select({ tipo: eventos.tipo }).from(eventos).where(eq(eventos.pautaId, pautaId))
    ).map((e) => e.tipo);
    expect(tipos).toContain('meta_batida');
    const [pauta] = await db.select().from(pautas).where(eq(pautas.id, pautaId));
    expect(pauta?.status).toBe('meta_batida');
    const avisos = await db.select().from(disparos).where(eq(disparos.aviso, pautaId));
    expect(avisos).toHaveLength(1);
    expect(avisos[0]?.tipo).toBe('meta_batida');
  });

  it('pauta que não recebe apoio volta ao menu sem gravar nada', async () => {
    await verificar();
    await send('1');
    await send(RELATO);
    // A pauta saiu de `juntando_apoios` enquanto a pessoa escolhia.
    await db.update(pautas).set({ status: 'conquistada' }).where(eq(pautas.id, pautaId));
    expect(await send(`pauta:${pautaId}`)).toEqual([SUPPORT_CLOSED_TEXT, MENU_TEXT]);
    expect(await apoiosDaPauta()).toHaveLength(0);
    expect(await passo()).toBe('MENU');
    expect(await dados()).toEqual({});
  });

  it('quem não é verificado vai para a verificação com o apoio guardado', async () => {
    const respostas = await escolherAPauta();
    expect(respostas).toEqual([SUPPORT_VERIFY_FIRST_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
    expect(await dados()).toMatchObject({ pendingCommand: { kind: 'apoiar', id: pautaId } });
    // O relato fica (cifrado) para ser oferecido depois da verificação.
    expect(await dados()).toHaveProperty('relatoCifrado');
    expect(await apoiosDaPauta()).toHaveLength(0);
  });
});

describe('relato e foto do apoio (2.7)', () => {
  beforeEach(async () => {
    await verificar();
    await escolherAPauta();
  });

  it('"sim" e foto gravam o relato pendente com a foto', async () => {
    expect(await send('sim')).toEqual([SUPPORT_PHOTO_ASK_TEXT]);
    expect(await passo()).toBe('SUPPORT_ASK_PHOTO');
    expect(await sendFoto()).toEqual([REPORT_SENT_WITH_PHOTO_TEXT, MENU_TEXT]);
    const [relato, ...resto] = await relatosDaPauta();
    expect(resto).toEqual([]);
    expect(relato).toMatchObject({
      texto: RELATO,
      fotoChave: 'fotos/2026/11/abc.jpg',
      moderacao: 'pendente',
    });
    expect(await passo()).toBe('MENU');
    expect(await dados()).toEqual({});
  });

  it("'pular' a foto grava só o relato, pendente", async () => {
    await send('sim');
    expect(await send('pular')).toEqual([REPORT_SENT_TEXT, MENU_TEXT]);
    const [relato] = await relatosDaPauta();
    expect(relato).toMatchObject({ texto: RELATO, fotoChave: null, moderacao: 'pendente' });
  });

  it('"não" encerra sem relato, com o apoio contado', async () => {
    expect(await send('não')).toEqual([SUPPORT_DONE_TEXT, MENU_TEXT]);
    expect(await relatosDaPauta()).toEqual([]);
    expect(await apoiosDaPauta()).toHaveLength(1);
    expect(await dados()).toEqual({});
  });

  it('resposta fora de sim/não pergunta de novo', async () => {
    expect(await send('talvez')).toEqual([ASK_ATTACH_REPORT_TEXT]);
    expect(await passo()).toBe('SUPPORT_ASK_REPORT');
  });

  it('foto recusada fica no passo da foto, para mandar outra ou pular', async () => {
    await send('sim');
    resultadoDaFoto = { ok: false, motivo: 'tamanho' };
    expect(await sendFoto()).toEqual([photoRefusedText('tamanho')]);
    expect(await passo()).toBe('SUPPORT_ASK_PHOTO');
    expect(await relatosDaPauta()).toEqual([]);
  });

  it('texto que não é pular, no passo da foto, pede a foto de novo', async () => {
    await send('sim');
    expect(await send('olha')).toEqual([SUPPORT_PHOTO_ASK_TEXT]);
  });

  it('foto antes de responder sobre o relato pede resposta em texto', async () => {
    const [resposta] = await sendFoto();
    expect(resposta).toContain('preciso de uma resposta em texto');
    expect(await passo()).toBe('SUPPORT_ASK_REPORT');
  });

  it('nada do relato fica em claro na conversa', async () => {
    await send('sim');
    const linhas = JSON.stringify(await db.select().from(conversas));
    expect(linhas).not.toContain('bebedouro do bloco 18');
  });

  it('nada do relato aparece na view pública antes da moderação', async () => {
    await send('sim');
    await send('pular');
    expect(await relatosDaPauta()).toHaveLength(1);
    const publicos = await db.execute(sql`SELECT texto FROM v_relato_publico`);
    expect(JSON.stringify(publicos)).not.toContain(RELATO);
  });
});

describe('apoio sem relato da 2.5 (pedido guardado)', () => {
  beforeEach(async () => {
    await verificar();
    await store.save(H, 'SUPPORT_ASK_REPORT', { apoioPautaId: pautaId });
  });

  it('escrever o relato pede a foto e grava o texto escrito', async () => {
    expect(await send('  o filtro tá sujo  ')).toEqual([SUPPORT_PHOTO_ASK_TEXT]);
    await send('pular');
    const [relato] = await relatosDaPauta();
    expect(relato?.texto).toBe('o filtro tá sujo');
  });

  it("'pular' encerra sem relato", async () => {
    expect(await send('pular')).toEqual([SUPPORT_DONE_TEXT, MENU_TEXT]);
    expect(await relatosDaPauta()).toEqual([]);
  });

  it('relato longo demais pede um mais curto', async () => {
    const longo = 'a'.repeat(RELATO_MAXIMO + 1);
    expect(await send(longo)).toEqual([reportTooLongText(RELATO_MAXIMO + 1)]);
    expect(await passo()).toBe('SUPPORT_ASK_REPORT');
  });

  it('a pergunta sem relato convida a escrever', () => {
    expect(ASK_WRITE_REPORT_TEXT).toContain("'pular'");
  });
});
