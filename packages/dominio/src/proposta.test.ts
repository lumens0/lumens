import { eq, eventos, pautas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarEstudanteVerificado, criarPauta, tornarOwner } from './fabricas';
import {
  propostasAbertas,
  publicarProposta,
  registrarExecucaoProposta,
  registrarVoluntario,
} from './proposta';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

const eventosDa = (pautaId: string) =>
  db
    .select({ tipo: eventos.tipo, dados: eventos.dados, publico: eventos.publico })
    .from(eventos)
    .where(eq(eventos.pautaId, pautaId));

async function pautaComOwner(status: (typeof pautas.$inferInsert)['status'] = 'cobrando') {
  const pauta = await criarPauta(db, { status });
  const owner = await criarEstudanteVerificado(db);
  await tornarOwner(db, pauta.id, owner.id);
  return { pauta, owner };
}

const publicar = (pautaId: string, porEstudanteId: string) =>
  db.transaction((tx) =>
    publicarProposta(tx, {
      pautaId,
      porEstudanteId,
      descricao: '  Mutirão para pintar as faixas  ',
      pessoasNecessarias: 2,
    }),
  );

describe('publicarProposta (RF-B14)', () => {
  it('o owner publica: a proposta fica aberta e a linha do tempo mostra', async () => {
    const { pauta, owner } = await pautaComOwner();

    const r = await publicar(pauta.id, owner.id);

    if (!r.publicada) throw new Error('não publicou');
    expect(await propostasAbertas(db, pauta.id)).toEqual([
      {
        id: r.propostaId,
        descricao: 'Mutirão para pintar as faixas',
        pessoasNecessarias: 2,
        voluntarios: 0,
      },
    ]);
    expect(await eventosDa(pauta.id)).toEqual([
      {
        tipo: 'proposta_publicada',
        dados: { proposta_id: r.propostaId, pessoas_necessarias: 2 },
        publico: true,
      },
    ]);
  });

  it('quem não é owner não publica, nem em pauta que terminou', async () => {
    const { pauta } = await pautaComOwner();
    const outro = await criarEstudanteVerificado(db);
    expect(await publicar(pauta.id, outro.id)).toEqual({
      publicada: false,
      motivo: 'nao_e_owner',
    });

    const fechada = await pautaComOwner('conquistada');
    expect(await publicar(fechada.pauta.id, fechada.owner.id)).toEqual({
      publicada: false,
      motivo: 'pauta_fechada',
    });
    expect(await propostasAbertas(db, pauta.id)).toEqual([]);
  });
});

describe('registrarVoluntario (RF-B16)', () => {
  it('entra na lista uma vez só, e a contagem acompanha', async () => {
    const { pauta, owner } = await pautaComOwner();
    const r = await publicar(pauta.id, owner.id);
    if (!r.publicada) throw new Error('não publicou');
    const [a, b] = [await criarEstudanteVerificado(db), await criarEstudanteVerificado(db)];

    const vou = (estudanteId: string) =>
      db.transaction((tx) => registrarVoluntario(tx, { propostaId: r.propostaId, estudanteId }));

    expect(await vou(a.id)).toMatchObject({ registrado: true, jaEstava: false });
    expect(await vou(a.id)).toMatchObject({ registrado: true, jaEstava: true });
    expect(await vou(b.id)).toMatchObject({
      registrado: true,
      jaEstava: false,
      proposta: { voluntarios: 2, pessoasNecessarias: 2 },
    });
    // Voluntário não vira evento: a linha do tempo não leva quem ajudou.
    expect((await eventosDa(pauta.id)).map((e) => e.tipo)).toEqual(['proposta_publicada']);
  });

  it('proposta feita ou inexistente não aceita voluntário', async () => {
    const { pauta, owner } = await pautaComOwner();
    const r = await publicar(pauta.id, owner.id);
    if (!r.publicada) throw new Error('não publicou');
    await db.transaction((tx) => registrarExecucaoProposta(tx, { propostaId: r.propostaId }));
    const estudante = await criarEstudanteVerificado(db);

    expect(
      await db.transaction((tx) =>
        registrarVoluntario(tx, { propostaId: r.propostaId, estudanteId: estudante.id }),
      ),
    ).toEqual({ registrado: false, motivo: 'proposta_encerrada' });
    expect(
      await db.transaction((tx) =>
        registrarVoluntario(tx, {
          propostaId: '00000000-0000-0000-0000-000000000000',
          estudanteId: estudante.id,
        }),
      ),
    ).toEqual({ registrado: false, motivo: 'proposta_inexistente' });
    expect(await propostasAbertas(db, pauta.id)).toEqual([]);
  });
});
