import {
  blocos,
  conversas,
  eq,
  estudantes,
  papeisPauta,
  pautas,
  relatos,
  type Db,
} from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { segredoCom } from '../../cripto';
import { MENU_TEXT } from './handlers';
import {
  BLOCK_GONE_TEXT,
  CURADORIA,
  DESCRIPTION_EMPTY_TEXT,
  DESCRIPTION_QUESTION_TEXT,
  FROM_REPORT_DESCRIPTION_TEXT,
  NO_PHOTO_TEXT,
  NOT_VERIFIED_AT_END_TEXT,
  PHOTO_ASK_TEXT,
  PHOTO_RECEIVED_TEXT,
  TITLE_EMPTY_TEXT,
  VERIFY_FIRST_TEXT,
  descriptionTooLongText,
  resumo,
  titleTooLongText,
} from './nova-pauta';
import { hashPhone } from './phone';
import { BLOCK_NOT_FOUND_TEXT, CAMPUS_ROW_ID, NEW_FROM_REPORT_TEXT, OTHER_ROW_ID } from './relato';
import type { MensagemDeLista, Resposta } from './resposta';
import { handleIncoming } from './router';
import { ConversationStore } from './store';
import { NEW_TITLE_TEXT } from './texto';

const CHAVE = Buffer.alloc(32, 7);
const H = hashPhone('5582999990000', CHAVE);
const segredo = segredoCom(CHAVE);
const DESCRICAO = 'O bebedouro do térreo não funciona há duas semanas.';

let db: Db;
let store: ConversationStore;
let bloco18: string;
let artes: string;

const send = (text: string) => handleIncoming({ phoneHmac: H, text }, { store, db, segredo });
const sendFoto = () =>
  handleIncoming(
    { phoneHmac: H, text: '', image: { id: 'midia-1', mimeType: 'image/jpeg' } },
    { store, db, segredo },
  );
const passo = async () => (await store.get(H))?.step;
const dados = async () => (await store.get(H))?.data ?? {};
const todasAsPautas = () => db.select().from(pautas);

function listaEm(respostas: Resposta[]): MensagemDeLista {
  const achada = respostas.find((r): r is MensagemDeLista => typeof r !== 'string');
  if (!achada) throw new Error(`nenhuma lista em ${JSON.stringify(respostas)}`);
  return achada;
}

function resumoEm(respostas: Resposta[]): string {
  const achado = respostas.find(
    (r): r is string => typeof r === 'string' && r.startsWith('Pauta enviada'),
  );
  if (achado === undefined) throw new Error(`nenhum resumo em ${JSON.stringify(respostas)}`);
  return achado;
}

async function verificar() {
  const [estudante] = await db
    .insert(estudantes)
    .values({ telefoneHmac: H, telefoneCifrado: 'x', verificadoEm: new Date() })
    .returning({ id: estudantes.id });
  if (!estudante) throw new Error('estudante não inserido');
  return estudante.id;
}

// Banco em memória novo + mensagens iniciais: no Windows, com os testes em paralelo, passa de 20s.
beforeEach(async () => {
  db = await criarBancoEmMemoria();
  store = new ConversationStore(db);
  const [b18, art] = await db
    .insert(blocos)
    .values([
      { slug: 'bloco-18', nome: 'Bloco 18', baseEstudantes: 1200 },
      { slug: 'artes', nome: 'Bloco de Artes', baseEstudantes: 300 },
    ])
    .returning({ id: blocos.id });
  if (!b18 || !art) throw new Error('blocos não inseridos');
  bloco18 = b18.id;
  artes = art.id;
  await send('oi');
}, 60_000);

afterEach(() => {
  CURADORIA.prazo = null;
});

describe('porta de entrada (verificação)', () => {
  it('quem não é verificado vai para a verificação, guardando o pedido de pauta nova', async () => {
    expect(await send('2')).toEqual([VERIFY_FIRST_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
    expect(await dados()).toEqual({ pendingCommand: { kind: 'nova-pauta' } });
    expect(await todasAsPautas()).toEqual([]);
  });

  it('estudante que saiu (RN01) também vai para a verificação', async () => {
    const id = await verificar();
    await db.update(estudantes).set({ saiuEm: new Date() }).where(eq(estudantes.id, id));
    expect(await send('2')).toEqual([VERIFY_FIRST_TEXT]);
  });

  it('vindo do relato (2.5) sem verificação, o relato e o bloco ficam para depois', async () => {
    await send('1');
    await send('a porta do bloco 18 ta emperrada');
    expect(await send('sim')).toEqual([NEW_FROM_REPORT_TEXT, VERIFY_FIRST_TEXT]);
    expect(await passo()).toBe('VERIFY_ASK_EMAIL');
    const data = await dados();
    expect(data).toMatchObject({ blocoId: bloco18, pendingCommand: { kind: 'nova-pauta' } });
    expect(data).toHaveProperty('relatoCifrado');
    expect(data).not.toHaveProperty('parecidas');
  });
});

describe('pauta nova pelo menu', () => {
  let estudanteId: string;
  beforeEach(async () => {
    estudanteId = await verificar();
    expect(await send('2')).toEqual([NEW_TITLE_TEXT]);
  });

  it('título → bloco na lista → descrição → pular foto → pauta em curadoria e resumo', async () => {
    const pergunta = listaEm(await send('Bebedouro quebrado'));
    expect(pergunta.linhas.map((l) => l.id)).toEqual([
      `bloco:${bloco18}`,
      `bloco:${artes}`,
      CAMPUS_ROW_ID,
    ]);
    expect(await passo()).toBe('NEW_ASK_PLACE');

    expect(await send(`bloco:${bloco18}`)).toEqual([DESCRIPTION_QUESTION_TEXT]);
    expect(await send(DESCRICAO)).toEqual([PHOTO_ASK_TEXT]);

    const respostas = await send('pular');
    expect(respostas[0]).toBe(NO_PHOTO_TEXT);
    expect(respostas.at(-1)).toBe(MENU_TEXT);
    const texto = resumoEm(respostas);
    expect(texto).toContain('*Título:* Bebedouro quebrado');
    expect(texto).toContain('*Local:* Bloco 18');
    expect(texto).toContain('*Meta:* 120 apoios');
    expect(texto).toContain('*Foto:* não');

    const [pauta] = await todasAsPautas();
    expect(pauta).toMatchObject({
      titulo: 'Bebedouro quebrado',
      descricao: DESCRICAO,
      blocoId: bloco18,
      status: 'em_curadoria',
      meta: 120,
    });
    if (!pauta) throw new Error('pauta não criada');
    expect(
      await db.select().from(papeisPauta).where(eq(papeisPauta.pautaId, pauta.id)),
    ).toMatchObject([{ estudanteId, papel: 'owner' }]);
    expect(await db.select().from(relatos).where(eq(relatos.pautaId, pauta.id))).toMatchObject([
      { estudanteId, texto: DESCRICAO, moderacao: 'pendente' },
    ]);

    expect(await passo()).toBe('MENU');
    expect(await dados()).toEqual({});
  });

  it('com foto, agradece e o resumo diz que tem foto', async () => {
    for (const t of ['Bebedouro', 'não sei', DESCRICAO]) await send(t);
    const respostas = await sendFoto();
    expect(respostas[0]).toBe(PHOTO_RECEIVED_TEXT);
    expect(resumoEm(respostas)).toContain('*Foto:* sim');
    expect(await todasAsPautas()).toHaveLength(1);
  });

  it('"não sei" é o campus inteiro, com a meta máxima', async () => {
    for (const t of ['Fila do RU', 'não sei', 'Fila gigante no almoço.']) await send(t);
    const texto = resumoEm(await send('pular'));
    expect(texto).toContain('*Local:* Todo o campus');
    expect(texto).toContain('*Meta:* 300 apoios');
    expect((await todasAsPautas())[0]?.blocoId).toBeNull();
  });

  it('título em branco ou com mais de 80 caracteres pergunta de novo', async () => {
    expect(await send('   ')).toEqual([TITLE_EMPTY_TEXT]);
    expect(await send('x'.repeat(81))).toEqual([titleTooLongText(81)]);
    expect(await passo()).toBe('NEW_ASK_TITLE');
    listaEm(await send('x'.repeat(80)));
    expect(await passo()).toBe('NEW_ASK_PLACE');
  });

  it('aceita o bloco digitado e repete a lista quando não acha', async () => {
    await send('Iluminação');
    const respostas = await send('bloco 99');
    expect(respostas[0]).toBe(BLOCK_NOT_FOUND_TEXT);
    listaEm(respostas);
    expect(await passo()).toBe('NEW_ASK_PLACE');
    expect(await send('artes')).toEqual([DESCRIPTION_QUESTION_TEXT]);
    expect(await dados()).toMatchObject({ blocoId: artes });
  });

  it('descrição em branco ou longa demais pergunta de novo', async () => {
    for (const t of ['Bebedouro', 'não sei']) await send(t);
    expect(await send(' ')).toEqual([DESCRIPTION_EMPTY_TEXT]);
    expect(await send('x'.repeat(2001))).toEqual([descriptionTooLongText(2001)]);
    expect(await passo()).toBe('NEW_ASK_DESCRIPTION');
  });

  it('no passo da foto, texto qualquer pede a foto de novo', async () => {
    for (const t of ['Bebedouro', 'não sei', DESCRICAO]) await send(t);
    expect(await send('já mandei')).toEqual([PHOTO_ASK_TEXT]);
    expect(await passo()).toBe('NEW_ASK_PHOTO');
  });

  it('título e descrição ficam cifrados na conversa, nunca em claro', async () => {
    for (const t of ['Título secreto da pauta', 'não sei', 'Descrição secreta']) await send(t);
    const linhas = JSON.stringify(await db.select().from(conversas));
    expect(linhas).not.toContain('Título secreto');
    expect(linhas).not.toContain('Descrição secreta');
  });

  it('estudante que deixa de ser verificado no meio não cria pauta', async () => {
    for (const t of ['Bebedouro', 'não sei', DESCRICAO]) await send(t);
    await db.update(estudantes).set({ saiuEm: new Date() }).where(eq(estudantes.id, estudanteId));
    expect(await send('pular')).toEqual([NOT_VERIFIED_AT_END_TEXT, MENU_TEXT]);
    expect(await todasAsPautas()).toEqual([]);
    expect(await dados()).toEqual({});
  });

  it('bloco apagado no meio da conversa não cria pauta', async () => {
    const [extra] = await db
      .insert(blocos)
      .values({ slug: 'extra', nome: 'Bloco Extra', baseEstudantes: 100 })
      .returning({ id: blocos.id });
    if (!extra) throw new Error('bloco não inserido');
    for (const t of ['Bebedouro', `bloco:${extra.id}`, DESCRICAO]) await send(t);
    await db.delete(blocos).where(eq(blocos.id, extra.id));
    expect(await send('pular')).toEqual([BLOCK_GONE_TEXT, MENU_TEXT]);
    expect(await todasAsPautas()).toEqual([]);
  });

  it("'cancelar' no meio não cria pauta e limpa as respostas", async () => {
    for (const t of ['Bebedouro', 'não sei']) await send(t);
    await send('cancelar');
    expect(await dados()).toEqual({});
    expect(await todasAsPautas()).toEqual([]);
  });
});

describe('pauta nova vinda do relato (2.5)', () => {
  const RELATO = 'o bebedouro do bloco 18 ta quebrado, sala 12';

  beforeEach(async () => {
    await verificar();
    await send('1');
  });

  it('pula local e descrição: o relato vira a descrição e o primeiro relato', async () => {
    await send(RELATO);
    expect(await send(OTHER_ROW_ID)).toEqual([NEW_FROM_REPORT_TEXT, NEW_TITLE_TEXT]);
    expect(await send('Bebedouro do Bloco 18')).toEqual([
      FROM_REPORT_DESCRIPTION_TEXT,
      PHOTO_ASK_TEXT,
    ]);
    expect(await passo()).toBe('NEW_ASK_PHOTO');

    expect(resumoEm(await send('pular'))).toContain('*Local:* Bloco 18');
    const [pauta] = await todasAsPautas();
    expect(pauta).toMatchObject({ titulo: 'Bebedouro do Bloco 18', descricao: RELATO });
    if (!pauta) throw new Error('pauta não criada');
    expect(await db.select().from(relatos).where(eq(relatos.pautaId, pauta.id))).toMatchObject([
      { texto: RELATO },
    ]);
    expect(await dados()).toEqual({});
  });

  it('relato maior que o limite da descrição: pergunta a descrição', async () => {
    await send(`a porta do bloco 18 ta emperrada${' muito'.repeat(400)}`);
    await send('sim');
    expect(await send('Porta emperrada')).toEqual([DESCRIPTION_QUESTION_TEXT]);
    expect(await passo()).toBe('NEW_ASK_DESCRIPTION');
  });
});

describe('resumo', () => {
  it('mostra o prazo da curadoria quando a equipe definir', async () => {
    const semPrazo = await resumo(db, { titulo: 'T', blocoId: null, meta: 300, comFoto: false });
    expect(semPrazo).not.toContain('A curadoria responde');

    CURADORIA.prazo = 'em até 3 dias úteis';
    const comPrazo = await resumo(db, { titulo: 'T', blocoId: null, meta: 300, comFoto: false });
    expect(comPrazo).toContain('A curadoria responde em até 3 dias úteis.');
  });
});
