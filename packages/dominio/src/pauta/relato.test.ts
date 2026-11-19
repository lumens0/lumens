import { eq, estudantes, relatoFotos, relatos, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarEstudanteVerificado, criarPauta } from '../teste/fabricas';
import {
  RELATO_MAXIMO,
  adicionarRelato,
  anexarFotoAoRelato,
  type FotoDoRelato,
  type NovoRelatoDoEstudante,
} from './relato';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

const fotosDoRelato = (relatoId: string) =>
  db
    .select({
      chave: relatoFotos.chave,
      ordem: relatoFotos.ordem,
      moderacao: relatoFotos.moderacao,
    })
    .from(relatoFotos)
    .where(eq(relatoFotos.relatoId, relatoId))
    .orderBy(relatoFotos.ordem);

const relatar = (entrada: NovoRelatoDoEstudante) =>
  db.transaction((tx) => adicionarRelato(tx, entrada));

describe('adicionarRelato', () => {
  it('grava o relato pendente, com a foto e o texto sem espaços nas pontas', async () => {
    const pauta = await criarPauta(db);
    const estudante = await criarEstudanteVerificado(db);

    const r = await relatar({
      pautaId: pauta.id,
      estudanteId: estudante.id,
      texto: '  o bebedouro voltou a vazar  ',
      fotoChaves: ['fotos/2026/11/abc.jpg', 'fotos/2026/11/def.png'],
    });

    if (!r.registrado) throw new Error(`recusado: ${r.motivo}`);
    const [linha] = await db.select().from(relatos).where(eq(relatos.id, r.relatoId));
    expect(linha).toMatchObject({
      pautaId: pauta.id,
      texto: 'o bebedouro voltou a vazar',
      moderacao: 'pendente',
      moderadoEm: null,
    });
    expect(await fotosDoRelato(r.relatoId)).toEqual([
      { chave: 'fotos/2026/11/abc.jpg', ordem: 1, moderacao: 'pendente' },
      { chave: 'fotos/2026/11/def.png', ordem: 2, moderacao: 'pendente' },
    ]);
  });

  it('recusa mais fotos que o limite, sem gravar nada', async () => {
    const pauta = await criarPauta(db);
    const estudante = await criarEstudanteVerificado(db);
    expect(
      await relatar({
        pautaId: pauta.id,
        estudanteId: estudante.id,
        texto: 'vazando',
        fotoChaves: ['fotos/1.jpg', 'fotos/2.jpg', 'fotos/3.jpg', 'fotos/4.jpg'],
      }),
    ).toEqual({ registrado: false, motivo: 'fotos_demais' });
    expect(await db.select().from(relatos).where(eq(relatos.pautaId, pauta.id))).toEqual([]);
  });

  it('sem foto, não grava foto nenhuma', async () => {
    const pauta = await criarPauta(db);
    const estudante = await criarEstudanteVerificado(db);
    const r = await relatar({ pautaId: pauta.id, estudanteId: estudante.id, texto: 'vazando' });
    if (!r.registrado) throw new Error(`recusado: ${r.motivo}`);
    const [linha] = await db.select().from(relatos).where(eq(relatos.id, r.relatoId));
    expect(linha).toBeDefined();
    expect(await fotosDoRelato(r.relatoId)).toEqual([]);
  });

  it.each([
    ['   ', 'texto_vazio'],
    ['a'.repeat(RELATO_MAXIMO + 1), 'texto_longo'],
  ])('recusa texto inválido (%#) sem gravar', async (texto, motivo) => {
    const pauta = await criarPauta(db);
    const estudante = await criarEstudanteVerificado(db);
    expect(await relatar({ pautaId: pauta.id, estudanteId: estudante.id, texto })).toEqual({
      registrado: false,
      motivo,
    });
    expect(await db.select().from(relatos).where(eq(relatos.pautaId, pauta.id))).toEqual([]);
  });

  it('recusa pauta recusada e pauta que não existe', async () => {
    const recusada = await criarPauta(db, { status: 'recusada' });
    const estudante = await criarEstudanteVerificado(db);
    expect(
      await relatar({ pautaId: recusada.id, estudanteId: estudante.id, texto: 'vazando' }),
    ).toEqual({ registrado: false, motivo: 'pauta_sem_relato' });
    expect(
      await relatar({
        pautaId: '00000000-0000-4000-8000-000000000000',
        estudanteId: estudante.id,
        texto: 'vazando',
      }),
    ).toEqual({ registrado: false, motivo: 'pauta_inexistente' });
  });

  it('recusa quem não é verificado ou já saiu', async () => {
    const pauta = await criarPauta(db);
    const saiu = await criarEstudanteVerificado(db);
    await db.update(estudantes).set({ saiuEm: new Date() }).where(eq(estudantes.id, saiu.id));
    expect(await relatar({ pautaId: pauta.id, estudanteId: saiu.id, texto: 'vazando' })).toEqual({
      registrado: false,
      motivo: 'estudante_nao_verificado',
    });
  });
});

describe('anexarFotoAoRelato (SCRUM-301)', () => {
  const FOTO = 'fotos/2026/11/depois.jpg';
  const anexar = (entrada: FotoDoRelato) => db.transaction((tx) => anexarFotoAoRelato(tx, entrada));

  /** Relato pendente, sem foto, como o bot grava assim que o texto chega. */
  async function relatoSemFoto() {
    const pauta = await criarPauta(db);
    const estudante = await criarEstudanteVerificado(db);
    const r = await relatar({ pautaId: pauta.id, estudanteId: estudante.id, texto: 'vazando' });
    if (!r.registrado) throw new Error(`recusado: ${r.motivo}`);
    const foto = async () => (await fotosDoRelato(r.relatoId)).map((f) => f.chave);
    return { relatoId: r.relatoId, estudanteId: estudante.id, foto };
  }

  it('junta a foto ao mesmo relato, que continua pendente', async () => {
    const { relatoId, estudanteId, foto } = await relatoSemFoto();
    expect(await anexar({ relatoId, estudanteId, fotoChave: FOTO })).toEqual({
      anexada: true,
      total: 1,
    });
    expect(await foto()).toEqual([FOTO]);
    const [linha] = await db.select().from(relatos).where(eq(relatos.id, relatoId));
    expect(linha?.moderacao).toBe('pendente');
  });

  it('relato já moderado não recebe foto', async () => {
    const { relatoId, estudanteId, foto } = await relatoSemFoto();
    await db
      .update(relatos)
      .set({ moderacao: 'aprovado', moderadoEm: new Date() })
      .where(eq(relatos.id, relatoId));
    expect(await anexar({ relatoId, estudanteId, fotoChave: FOTO })).toEqual({
      anexada: false,
      motivo: 'ja_moderado',
    });
    expect(await foto()).toEqual([]);
  });

  it('junta até três fotos, na ordem, e recusa a quarta', async () => {
    const { relatoId, estudanteId, foto } = await relatoSemFoto();
    for (const n of [1, 2, 3]) {
      expect(
        await anexar({ relatoId, estudanteId, fotoChave: `fotos/tres-${String(n)}.jpg` }),
      ).toEqual({
        anexada: true,
        total: n,
      });
    }
    expect(await anexar({ relatoId, estudanteId, fotoChave: 'fotos/tres-4.jpg' })).toEqual({
      anexada: false,
      motivo: 'limite_de_fotos',
    });
    expect(await foto()).toEqual(['fotos/tres-1.jpg', 'fotos/tres-2.jpg', 'fotos/tres-3.jpg']);
  });

  it('a foto recusada continua contando no limite', async () => {
    const { relatoId, estudanteId } = await relatoSemFoto();
    for (const n of [1, 2, 3])
      await anexar({ relatoId, estudanteId, fotoChave: `fotos/rec-${String(n)}.jpg` });
    await db
      .update(relatoFotos)
      .set({ moderacao: 'recusado', motivoRecusa: 'x' })
      .where(eq(relatoFotos.relatoId, relatoId));
    expect(await anexar({ relatoId, estudanteId, fotoChave: 'fotos/rec-4.jpg' })).toEqual({
      anexada: false,
      motivo: 'limite_de_fotos',
    });
  });

  it('o banco também barra a quarta foto e a chave repetida', async () => {
    const { relatoId } = await relatoSemFoto();
    await expect(
      db.insert(relatoFotos).values({ relatoId, chave: 'fotos/x.jpg', ordem: 4 }),
    ).rejects.toThrow();
    await db.insert(relatoFotos).values({ relatoId, chave: 'fotos/y.jpg', ordem: 1 });
    await expect(
      db.insert(relatoFotos).values({ relatoId, chave: 'fotos/y.jpg', ordem: 2 }),
    ).rejects.toThrow();
  });

  it('só quem escreveu o relato junta a foto', async () => {
    const { relatoId, foto } = await relatoSemFoto();
    const outro = await criarEstudanteVerificado(db);
    expect(await anexar({ relatoId, estudanteId: outro.id, fotoChave: FOTO })).toEqual({
      anexada: false,
      motivo: 'relato_inexistente',
    });
    expect(await foto()).toEqual([]);
  });
});
