import { eq, estudantes, relatos, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarEstudanteVerificado, criarPauta } from '../teste/fabricas';
import { RELATO_MAXIMO, adicionarRelato, type NovoRelatoDoEstudante } from './relato';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

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
      fotoChave: 'fotos/2026/11/abc.jpg',
    });

    if (!r.registrado) throw new Error(`recusado: ${r.motivo}`);
    const [linha] = await db.select().from(relatos).where(eq(relatos.id, r.relatoId));
    expect(linha).toMatchObject({
      pautaId: pauta.id,
      texto: 'o bebedouro voltou a vazar',
      fotoChave: 'fotos/2026/11/abc.jpg',
      moderacao: 'pendente',
      moderadoEm: null,
    });
  });

  it('sem foto, grava fotoChave nula', async () => {
    const pauta = await criarPauta(db);
    const estudante = await criarEstudanteVerificado(db);
    const r = await relatar({ pautaId: pauta.id, estudanteId: estudante.id, texto: 'vazando' });
    if (!r.registrado) throw new Error(`recusado: ${r.motivo}`);
    const [linha] = await db.select().from(relatos).where(eq(relatos.id, r.relatoId));
    expect(linha?.fotoChave).toBeNull();
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
