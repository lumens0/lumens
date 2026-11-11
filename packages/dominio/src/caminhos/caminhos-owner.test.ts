import { caminhos, eq, eventos, papeisPauta, pautas, type Db, type StatusPauta } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { registrarProtocolo } from './caminho-registro';
import { STATUS_COM_CAMINHOS, abrirCaminho, caminhosDaPauta, pautasDoOwner } from './caminhos';
import { criarEstudanteVerificado, criarPauta, tornarOwner } from '../teste/fabricas';

/** História 3.3: o owner escolhe os caminhos. */

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

async function pautaComOwner(status: StatusPauta = 'juntando_apoios') {
  const pauta = await criarPauta(db, { status });
  const owner = await criarEstudanteVerificado(db);
  await tornarOwner(db, pauta.id, owner.id);
  return { pauta, owner };
}

const abrir = (pautaId: string, tipo: 'falabr' | 'comunidade', porEstudanteId: string) =>
  db.transaction((tx) => abrirCaminho(tx, { pautaId, tipo, porEstudanteId }));

describe('abrirCaminho só em pauta aprovada e não encerrada', () => {
  it.each(['em_curadoria', 'recusada', 'conquistada'] as const)(
    'pauta %s: recusa sem gravar nada',
    async (status) => {
      const { pauta, owner } = await pautaComOwner(status);
      expect(await abrir(pauta.id, 'falabr', owner.id)).toEqual({
        aberto: false,
        motivo: 'pauta_fechada',
      });
      expect(await db.select().from(caminhos).where(eq(caminhos.pautaId, pauta.id))).toEqual([]);
      expect(await db.select().from(eventos).where(eq(eventos.pautaId, pauta.id))).toEqual([]);
    },
  );

  it.each(STATUS_COM_CAMINHOS)('pauta %s: abre', async (status) => {
    const { pauta, owner } = await pautaComOwner(status);
    expect(await abrir(pauta.id, 'comunidade', owner.id)).toMatchObject({ aberto: true });
  });
});

describe('caminhosDaPauta (estado dos dois caminhos)', () => {
  it('sem caminho, lista vazia', async () => {
    const { pauta } = await pautaComOwner();
    expect(await caminhosDaPauta(db, pauta.id)).toEqual([]);
  });

  it('mostra cada caminho com tipo, status, protocolo e prazo, do mais antigo ao mais novo', async () => {
    const { pauta, owner } = await pautaComOwner();
    const falabr = await db.transaction((tx) =>
      abrirCaminho(tx, {
        pautaId: pauta.id,
        tipo: 'falabr',
        porEstudanteId: owner.id,
        agora: new Date('2026-11-01T12:00:00Z'),
      }),
    );
    await db.transaction((tx) =>
      abrirCaminho(tx, {
        pautaId: pauta.id,
        tipo: 'comunidade',
        porEstudanteId: owner.id,
        agora: new Date('2026-11-02T12:00:00Z'),
      }),
    );
    if (!falabr.aberto) throw new Error('Fala.BR não abriu');
    await db.transaction((tx) =>
      registrarProtocolo(tx, {
        caminhoId: falabr.caminhoId,
        protocolo: '23546.012345/2026-11',
        abertoEm: '2026-11-01',
      }),
    );

    const lista = await caminhosDaPauta(db, pauta.id);
    expect(lista).toMatchObject([
      { tipo: 'falabr', status: 'aberto', protocolo: '23546.012345/2026-11', prazo: '2026-12-01' },
      { tipo: 'comunidade', status: 'aberto', protocolo: null, prazo: null },
    ]);
  });

  it('um caminho aberto não impede o outro (RN07)', async () => {
    const { pauta, owner } = await pautaComOwner('meta_batida');
    await abrir(pauta.id, 'falabr', owner.id);
    expect(await abrir(pauta.id, 'comunidade', owner.id)).toMatchObject({ aberto: true });
    expect((await caminhosDaPauta(db, pauta.id)).map((c) => c.tipo)).toEqual([
      'falabr',
      'comunidade',
    ]);
  });
});

describe('pautasDoOwner', () => {
  it('lista as pautas em que a pessoa é owner ou co-owner ativo e pode abrir caminho', async () => {
    const estudante = await criarEstudanteVerificado(db);
    const antiga = await criarPauta(db, { status: 'juntando_apoios' });
    const nova = await criarPauta(db, { status: 'cobrando' });
    const comoCoOwner = await criarPauta(db, { status: 'meta_batida' });
    const emCuradoria = await criarPauta(db, { status: 'em_curadoria' });
    const conquistada = await criarPauta(db, { status: 'conquistada' });
    const saiu = await criarPauta(db, { status: 'juntando_apoios' });
    const deOutro = await criarPauta(db, { status: 'juntando_apoios' });

    await db
      .update(pautas)
      .set({ criadaEm: new Date('2026-01-01') })
      .where(eq(pautas.id, antiga.id));
    await db
      .update(pautas)
      .set({ criadaEm: new Date('2026-03-01') })
      .where(eq(pautas.id, nova.id));
    await db
      .update(pautas)
      .set({ criadaEm: new Date('2026-02-01') })
      .where(eq(pautas.id, comoCoOwner.id));

    for (const p of [antiga, nova, emCuradoria, conquistada, saiu]) {
      await tornarOwner(db, p.id, estudante.id);
    }
    await db
      .insert(papeisPauta)
      .values({ pautaId: comoCoOwner.id, estudanteId: estudante.id, papel: 'co_owner' });
    await db.update(papeisPauta).set({ ate: new Date() }).where(eq(papeisPauta.pautaId, saiu.id));
    await tornarOwner(db, deOutro.id, (await criarEstudanteVerificado(db)).id);

    expect((await pautasDoOwner(db, estudante.id)).map((p) => p.id)).toEqual([
      nova.id,
      comoCoOwner.id,
      antiga.id,
    ]);
  });

  it('quem não é owner de nada recebe lista vazia', async () => {
    const estudante = await criarEstudanteVerificado(db);
    expect(await pautasDoOwner(db, estudante.id)).toEqual([]);
  });
});
