import { apoios, disparos, eq, estudantes, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { enfileirarAvisoDeVitoria, MODELO_VITORIA } from './aviso-vitoria';
import { criarEstudanteVerificado, criarPauta } from '../teste/fabricas';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
}, 30_000);

const AGORA = new Date('2026-12-17T04:00:00.000Z');

async function pautaComApoiadores(status: 'conquistada' | 'prometido', quantos = 3) {
  const pauta = await criarPauta(db, { status, titulo: 'Lâmpadas do bloco 12' });
  const ids: string[] = [];
  for (let i = 0; i < quantos; i++) {
    const e = await criarEstudanteVerificado(db);
    await db.insert(apoios).values({ pautaId: pauta.id, estudanteId: e.id, origem: 'bot' });
    ids.push(e.id);
  }
  return { pauta, ids };
}

const avisar = (pautaId: string) =>
  db.transaction((tx) => enfileirarAvisoDeVitoria(tx, { pautaId, agora: AGORA }));

const avisosDa = (pautaId: string) => db.select().from(disparos).where(eq(disparos.aviso, pautaId));

describe('card de vitória (3.7c)', () => {
  it('enfileira um aviso por apoiador, com título e slug', async () => {
    const { pauta, ids } = await pautaComApoiadores('conquistada');

    expect(await avisar(pauta.id)).toBe(3);

    const avisos = await avisosDa(pauta.id);
    expect(avisos.map((a) => a.estudanteId).sort()).toEqual([...ids].sort());
    for (const a of avisos) {
      expect(a).toMatchObject({
        tipo: 'vitoria',
        modelo: MODELO_VITORIA,
        parametros: ['Lâmpadas do bloco 12', pauta.slug],
        enfileiradoEm: AGORA,
      });
    }
  });

  it('pauta que ainda não é conquista não avisa ninguém', async () => {
    const { pauta } = await pautaComApoiadores('prometido');

    expect(await avisar(pauta.id)).toBe(0);
    expect(await avisosDa(pauta.id)).toHaveLength(0);
  });

  it('quem saiu do sistema não recebe', async () => {
    const { pauta, ids } = await pautaComApoiadores('conquistada');
    const [saiu] = ids;
    if (saiu === undefined) throw new Error('sem apoiador');
    await db.update(estudantes).set({ saiuEm: AGORA }).where(eq(estudantes.id, saiu));

    expect(await avisar(pauta.id)).toBe(2);
    expect((await avisosDa(pauta.id)).map((a) => a.estudanteId)).not.toContain(saiu);
  });

  it('avisar de novo não repete', async () => {
    const { pauta } = await pautaComApoiadores('conquistada');

    await avisar(pauta.id);
    expect(await avisar(pauta.id)).toBe(0);
    expect(await avisosDa(pauta.id)).toHaveLength(3);
  });
});
