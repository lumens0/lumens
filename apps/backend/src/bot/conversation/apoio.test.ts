import {
  apoios,
  blocos,
  conversas,
  disparos,
  eq,
  estudantes,
  eventos,
  pautas,
  relatoFotos,
  relatos,
  sql,
  type Db,
} from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { FOTOS_POR_RELATO_MAXIMO, RELATO_MAXIMO } from '@lumens/dominio';
import { beforeEach, describe, expect, it } from 'vitest';
import { segredoCom } from '../../cripto/cifra';
import type { ResultadoFoto, ServicoDeFotos } from '../../fotos/servico';
import {
  ASK_ATTACH_REPORT_TEXT,
  ASK_WRITE_REPORT_TEXT,
  PHOTO_LIMIT_TEXT,
  PHOTO_NOT_ATTACHED_TEXT,
  REPORT_SENT_TEXT,
  REPORT_SENT_WITH_PHOTO_TEXT,
  SUPPORT_CLOSED_TEXT,
  SUPPORT_DONE_TEXT,
  SUPPORT_PHOTO_ASK_TEXT,
  SUPPORT_VERIFY_FIRST_TEXT,
  alreadySupportsText,
  cardDaPauta,
  goalReachedText,
  reportTooLongText,
  supportedText,
} from './apoio';
import { COOWNER_INVITE_TEXT } from './co-owner';
import { MENU_PRINCIPAL } from './handlers';
import { photoMoreText, photoRefusedText } from './nova-pauta';
import { hashPhone } from './phone';
import { CANCEL_PHOTO_TEXT, handleIncoming } from './router';
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
let fotosGuardadas = 0;
const fotos: ServicoDeFotos = {
  // Cada foto aceita ganha uma chave própria: a chave é única no banco.
  guardarFoto: () => {
    if (!resultadoDaFoto.ok) return Promise.resolve(resultadoDaFoto);
    fotosGuardadas += 1;
    const chave =
      fotosGuardadas === 1
        ? resultadoDaFoto.chave
        : `fotos/2026/11/abc-${String(fotosGuardadas)}.jpg`;
    return Promise.resolve({ ok: true, chave });
  },
};

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
/** Os relatos da pauta, cada um com as chaves das fotos (em ordem), como o painel os vê. */
const relatosDaPauta = async () => {
  const linhas = await db.select().from(relatos).where(eq(relatos.pautaId, pautaId));
  const todas = await db.select().from(relatoFotos).orderBy(relatoFotos.ordem);
  return linhas.map((l) => ({
    ...l,
    fotos: todas.filter((f) => f.relatoId === l.id).map((f) => f.chave),
  }));
};

async function verificar(telefoneHmac = H) {
  const [estudante] = await db
    .insert(estudantes)
    .values({ telefoneHmac, telefoneCifrado: 'x', verificadoEm: new Date() })
    .returning({ id: estudantes.id });
  if (!estudante) throw new Error('estudante não inserido');
  return estudante.id;
}

/** Convite para cuidar da pauta, ao fim do apoio, quando há vaga (2.8). */
const convite = () => ({
  tipo: 'botoes',
  corpo: COOWNER_INVITE_TEXT,
  botoes: [{ id: `cuidar ${pautaId}`, titulo: 'Quero cuidar' }],
});

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
  fotosGuardadas = 0;
  await send('oi');
}, 60_000);

describe('apoiar pela lista de parecidas (2.7)', () => {
  it('"É essa" registra o apoio, mostra o placar e oferece juntar o relato', async () => {
    await verificar();
    const respostas = await escolherAPauta();
    expect(respostas).toEqual([
      supportedText(TITULO, 1, 30),
      cardDaPauta('bebedouros', 1),
      ASK_ATTACH_REPORT_TEXT,
    ]);
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
    // O card vai de novo: quem toca em "Apoiar" outra vez também quer compartilhar.
    expect(respostas[1]).toEqual(cardDaPauta('bebedouros', 1));
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
      cardDaPauta('bebedouros', 1),
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
    expect(await send(`pauta:${pautaId}`)).toEqual([SUPPORT_CLOSED_TEXT, MENU_PRINCIPAL]);
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
    expect(await send('sim')).toEqual([REPORT_SENT_TEXT, SUPPORT_PHOTO_ASK_TEXT]);
    expect(await passo()).toBe('SUPPORT_ASK_PHOTO');
    // Cabe mais foto: o bot pergunta se tem mais alguma, em vez de fechar.
    expect(await sendFoto()).toEqual([photoMoreText(1)]);
    expect(await passo()).toBe('SUPPORT_ASK_PHOTO');
    expect(await send('pronto')).toEqual([REPORT_SENT_WITH_PHOTO_TEXT, convite(), MENU_PRINCIPAL]);
    const [relato, ...resto] = await relatosDaPauta();
    expect(resto).toEqual([]);
    expect(relato).toMatchObject({
      texto: RELATO,
      fotos: ['fotos/2026/11/abc.jpg'],
      moderacao: 'pendente',
    });
    expect(await passo()).toBe('MENU');
    expect(await dados()).toEqual({});
  });

  it('aceita até três fotos no mesmo relato e fecha sozinho na terceira', async () => {
    await send('sim');
    expect(await sendFoto()).toEqual([photoMoreText(1)]);
    expect(await sendFoto()).toEqual([photoMoreText(2)]);
    expect(await dados()).toMatchObject({ fotosJuntadas: 2 });
    expect(await sendFoto()).toEqual([REPORT_SENT_WITH_PHOTO_TEXT, convite(), MENU_PRINCIPAL]);
    expect(FOTOS_POR_RELATO_MAXIMO).toBe(3);
    const [relato, ...resto] = await relatosDaPauta();
    expect(resto).toEqual([]);
    expect(relato?.fotos).toEqual([
      'fotos/2026/11/abc.jpg',
      'fotos/2026/11/abc-2.jpg',
      'fotos/2026/11/abc-3.jpg',
    ]);
    expect(await passo()).toBe('MENU');
    expect(await dados()).toEqual({});
  });

  it('"pronto" depois de duas fotos fecha com as duas; a foto recusada no meio não conta', async () => {
    await send('sim');
    await sendFoto();
    resultadoDaFoto = { ok: false, motivo: 'formato' };
    // Com uma foto já recebida, a saída é *pronto*, não *pular*.
    expect(await sendFoto()).toEqual([photoRefusedText('formato', 1)]);
    expect(await passo()).toBe('SUPPORT_ASK_PHOTO');
    resultadoDaFoto = { ok: true, chave: 'fotos/2026/11/abc.jpg' };
    await sendFoto();
    expect(await send('pronto')).toEqual([REPORT_SENT_WITH_PHOTO_TEXT, convite(), MENU_PRINCIPAL]);
    expect((await relatosDaPauta())[0]?.fotos).toHaveLength(2);
  });

  it('o pedido de foto avisa que será pública, que dá para mandar três e que cada uma é analisada', () => {
    expect(SUPPORT_PHOTO_ASK_TEXT).toContain('LGPD');
    expect(SUPPORT_PHOTO_ASK_TEXT).toContain('até 3 fotos');
    expect(SUPPORT_PHOTO_ASK_TEXT).toContain('recusar cada uma');
  });

  it('com foto já enviada, texto solto lembra de mandar outra ou responder pronto', async () => {
    await send('sim');
    await sendFoto();
    expect(await send('olha')).toEqual([photoMoreText(1)]);
  });

  it("'pular' a foto deixa só o relato, pendente", async () => {
    await send('sim');
    expect(await send('pular')).toEqual([SUPPORT_DONE_TEXT, convite(), MENU_PRINCIPAL]);
    const [relato] = await relatosDaPauta();
    expect(relato).toMatchObject({ texto: RELATO, fotos: [], moderacao: 'pendente' });
  });

  it('"não" encerra sem relato, com o apoio contado', async () => {
    expect(await send('não')).toEqual([SUPPORT_DONE_TEXT, convite(), MENU_PRINCIPAL]);
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
    // O relato já está gravado; só a foto não entrou.
    expect(await relatosDaPauta()).toMatchObject([{ texto: RELATO, fotos: [] }]);
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
    expect(await send('  o filtro tá sujo  ')).toEqual([REPORT_SENT_TEXT, SUPPORT_PHOTO_ASK_TEXT]);
    await send('pular');
    const [relato] = await relatosDaPauta();
    expect(relato?.texto).toBe('o filtro tá sujo');
  });

  it("'pular' encerra sem relato", async () => {
    expect(await send('pular')).toEqual([SUPPORT_DONE_TEXT, MENU_PRINCIPAL]);
    expect(await relatosDaPauta()).toEqual([]);
  });

  it('relato longo demais pede um mais curto', async () => {
    const longo = 'a'.repeat(RELATO_MAXIMO + 1);
    expect(await send(longo)).toEqual([reportTooLongText(RELATO_MAXIMO + 1)]);
    expect(await passo()).toBe('SUPPORT_ASK_REPORT');
  });

  it('a pergunta sem relato convida a escrever', () => {
    expect(ASK_WRITE_REPORT_TEXT).toContain('*pular*');
  });
});

describe('relato não se perde no passo da foto (SCRUM-301)', () => {
  beforeEach(async () => {
    await verificar();
    await escolherAPauta();
    await send('sim');
  });

  it('o relato já está gravado quando a foto é pedida, e o texto sai da conversa', async () => {
    const [relato, ...resto] = await relatosDaPauta();
    expect(resto).toEqual([]);
    expect(relato).toMatchObject({ texto: RELATO, fotos: [], moderacao: 'pendente' });
    expect(await dados()).toMatchObject({ apoioPautaId: pautaId, relatoId: relato?.id });
    expect(await dados()).not.toHaveProperty('relatoCifrado');
  });

  it.each(['menu', 'cancelar', 'sair'])(
    '"%s" no passo da foto deixa o relato gravado, sem foto',
    async (comando) => {
      await send(comando);
      expect(await relatosDaPauta()).toMatchObject([{ texto: RELATO, fotos: [] }]);
    },
  );

  it('"cancelar" no passo da foto não diz que cancelou o relato, que já foi enviado', async () => {
    expect(await send('cancelar')).toEqual([CANCEL_PHOTO_TEXT, MENU_PRINCIPAL]);
    expect(await passo()).toBe('MENU');
  });

  it('"apoiar <outra pauta>" no passo da foto deixa o relato gravado, sem foto', async () => {
    const [b] = await db.select({ id: blocos.id }).from(blocos);
    await db.insert(pautas).values({
      slug: 'outra-pauta',
      titulo: 'Outra pauta',
      descricao: 'Outra descrição.',
      blocoId: b?.id ?? '',
      categoria: 'infraestrutura',
      status: 'juntando_apoios',
      meta: 30,
    });
    await send('apoiar outra-pauta');
    expect(await relatosDaPauta()).toMatchObject([{ texto: RELATO, fotos: [] }]);
  });

  it('conversa expirada no passo da foto deixa o relato gravado, sem foto', async () => {
    await db.delete(conversas);
    await send('oi');
    expect(await passo()).toBe('MENU');
    expect(await relatosDaPauta()).toMatchObject([{ texto: RELATO, fotos: [] }]);
  });

  it('a foto enviada depois é juntada ao mesmo relato', async () => {
    const [antes] = await relatosDaPauta();
    expect(await sendFoto()).toEqual([photoMoreText(1)]);
    expect(await send('pronto')).toEqual([REPORT_SENT_WITH_PHOTO_TEXT, convite(), MENU_PRINCIPAL]);
    const [depois, ...resto] = await relatosDaPauta();
    expect(resto).toEqual([]);
    expect(depois).toMatchObject({ id: antes?.id, fotos: ['fotos/2026/11/abc.jpg'] });
  });

  it('relato que já chegou ao limite de fotos (outra mensagem passou na frente): diz o limite, não que foi analisado', async () => {
    const [relato] = await relatosDaPauta();
    await db.insert(relatoFotos).values(
      [1, 2, 3].map((n) => ({
        relatoId: relato?.id ?? '',
        chave: `fotos/2026/11/cheio-${String(n)}.jpg`,
        ordem: n,
      })),
    );
    expect(await sendFoto()).toEqual([PHOTO_LIMIT_TEXT, convite(), MENU_PRINCIPAL]);
    expect((await relatosDaPauta())[0]?.fotos).toHaveLength(3);
  });

  it('relato moderado antes da foto chegar: a foto não entra e a pessoa é avisada', async () => {
    await db.update(relatos).set({ moderacao: 'aprovado', moderadoEm: new Date() });
    expect(await sendFoto()).toEqual([PHOTO_NOT_ATTACHED_TEXT, convite(), MENU_PRINCIPAL]);
    expect(await relatosDaPauta()).toMatchObject([{ moderacao: 'aprovado', fotos: [] }]);
  });

  it('conversa de antes da mudança (relato ainda nos dados) grava o relato com a foto', async () => {
    await db.delete(relatos);
    await store.save(H, 'SUPPORT_ASK_PHOTO', {
      apoioPautaId: pautaId,
      relatoCifrado: segredo.cifrar(RELATO),
    });
    expect(await sendFoto()).toEqual([REPORT_SENT_WITH_PHOTO_TEXT, convite(), MENU_PRINCIPAL]);
    expect(await relatosDaPauta()).toMatchObject([
      { texto: RELATO, fotos: ['fotos/2026/11/abc.jpg'], moderacao: 'pendente' },
    ]);
  });
});
