import { apoios, disparos, eq, estudantes, pautas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { registrarApoio } from './apoio';
import { enfileirarAvisoMetaBatida, pautasComMetaBatidaSemAviso } from './aviso-meta-batida';
import { criarEstudanteVerificado, criarPauta } from './fabricas';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
}, 30_000);

const MINUTO = 60_000;
const DIA = 86_400_000;
const AGORA = new Date('2026-11-09T15:00:00.000Z');
const depois = (ms: number) => new Date(AGORA.getTime() + ms);

/** Pauta de meta 3 que bate a meta pelo `registrarApoio` de verdade, em AGORA. */
async function pautaQueBateAMeta() {
  const pauta = await criarPauta(db, { meta: 3, titulo: 'Bebedouro do bloco 12' });
  const apoiadores: string[] = [];
  for (let i = 0; i < 3; i++) {
    const e = await criarEstudanteVerificado(db);
    const r = await db.transaction((tx) =>
      registrarApoio(tx, {
        pautaId: pauta.id,
        estudanteId: e.id,
        origem: 'bot',
        agora: depois(i * MINUTO - 3 * MINUTO),
      }),
    );
    apoiadores.push(e.id);
    if (i === 2) expect(r).toMatchObject({ registrado: true, metaBatidaAgora: true });
  }
  return { pauta, apoiadores };
}

const avisar = (pautaId: string) =>
  db.transaction((tx) => enfileirarAvisoMetaBatida(tx, { pautaId, agora: AGORA }));

const avisosDa = (pautaId: string) => db.select().from(disparos).where(eq(disparos.aviso, pautaId));

describe('aviso de meta batida (3.2)', () => {
  it('enfileira um aviso por apoiador, com título, meta e slug', async () => {
    const { pauta, apoiadores } = await pautaQueBateAMeta();

    expect(await avisar(pauta.id)).toBe(3);

    const avisos = await avisosDa(pauta.id);
    expect(avisos.map((a) => a.estudanteId).sort()).toEqual([...apoiadores].sort());
    expect(avisos[0]).toMatchObject({
      tipo: 'meta_batida',
      modelo: 'lumens_meta_batida',
      parametros: ['Bebedouro do bloco 12', '3', pauta.slug],
    });
  });

  it('quem apoiou depois de bater a meta não recebe "a pauta que você apoiou chegou à meta"', async () => {
    const { pauta } = await pautaQueBateAMeta();
    const tardio = await criarEstudanteVerificado(db);
    await db
      .insert(apoios)
      .values({ pautaId: pauta.id, estudanteId: tardio.id, origem: 'site', criadoEm: depois(DIA) });

    await avisar(pauta.id);

    expect((await avisosDa(pauta.id)).map((a) => a.estudanteId)).not.toContain(tardio.id);
  });

  it('quem saiu do sistema não recebe', async () => {
    const { pauta, apoiadores } = await pautaQueBateAMeta();
    await db
      .update(estudantes)
      .set({ saiuEm: AGORA })
      .where(eq(estudantes.id, apoiadores[0] ?? ''));

    expect(await avisar(pauta.id)).toBe(2);
  });

  it('avisar de novo não repete', async () => {
    const { pauta } = await pautaQueBateAMeta();
    await avisar(pauta.id);

    expect(await avisar(pauta.id)).toBe(0);
    expect(await avisosDa(pauta.id)).toHaveLength(3);
  });

  it('pauta sem meta batida não avisa ninguém', async () => {
    const pauta = await criarPauta(db);

    expect(await avisar(pauta.id)).toBe(0);
  });

  describe('pautasComMetaBatidaSemAviso', () => {
    it('acha a pauta que bateu a meta e ainda não foi avisada', async () => {
      const { pauta } = await pautaQueBateAMeta();

      expect(await pautasComMetaBatidaSemAviso(db, depois(MINUTO))).toContain(pauta.id);

      await avisar(pauta.id);
      expect(await pautasComMetaBatidaSemAviso(db, depois(MINUTO))).not.toContain(pauta.id);
    });

    it('meta batida há mais de sete dias não é mais notícia', async () => {
      const { pauta } = await pautaQueBateAMeta();
      await db
        .update(pautas)
        .set({ metaBatidaEm: depois(-8 * DIA) })
        .where(eq(pautas.id, pauta.id));

      expect(await pautasComMetaBatidaSemAviso(db, AGORA)).not.toContain(pauta.id);
    });
  });
});
