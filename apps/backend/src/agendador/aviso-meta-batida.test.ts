import { disparos, eq, estudantes, pautas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { registrarApoio } from '@lumens/dominio';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarLogger } from '../infra/logger';
import { avisarMetasBatidas } from './aviso-meta-batida';

let db: Db;
const logger = criarLogger('silent');
const AGORA = new Date('2026-11-09T15:00:00.000Z');

beforeAll(async () => {
  db = await criarBancoEmMemoria();
}, 30_000);

let seq = 0;

/** Pauta de meta 2 com dois apoios pelo domínio: o segundo bate a meta. */
async function pautaQueBateAMeta() {
  const n = String(++seq);
  const [pauta] = await db
    .insert(pautas)
    .values({
      slug: `pauta-${n}`,
      titulo: 'Bebedouro do bloco 12',
      descricao: 'Quebrado.',
      categoria: 'infraestrutura',
      status: 'juntando_apoios',
      meta: 2,
    })
    .returning();
  if (pauta === undefined) throw new Error('pauta não criada');
  for (let i = 0; i < 2; i++) {
    const [e] = await db
      .insert(estudantes)
      .values({ telefoneHmac: `t-${n}-${String(i)}`, telefoneCifrado: 'x', verificadoEm: AGORA })
      .returning();
    if (e === undefined) throw new Error('estudante não criado');
    await db.transaction((tx) =>
      registrarApoio(tx, { pautaId: pauta.id, estudanteId: e.id, origem: 'bot', agora: AGORA }),
    );
  }
  return pauta.id;
}

describe('avisarMetasBatidas (SCRUM-207)', () => {
  it('enfileira o aviso para quem apoiou a pauta que bateu a meta', async () => {
    const pautaId = await pautaQueBateAMeta();

    const resultado = await avisarMetasBatidas(db, logger, new Date(AGORA.getTime() + 60_000));

    expect(resultado).toMatchObject({ pautas: 1, avisos: 2, falhas: 0 });
    expect(await db.select().from(disparos).where(eq(disparos.aviso, pautaId))).toHaveLength(2);
  });

  it('a rodada seguinte não repete', async () => {
    await pautaQueBateAMeta();
    await avisarMetasBatidas(db, logger, new Date(AGORA.getTime() + 60_000));

    const segunda = await avisarMetasBatidas(db, logger, new Date(AGORA.getTime() + 120_000));

    expect(segunda).toMatchObject({ pautas: 0, avisos: 0 });
  });
});
