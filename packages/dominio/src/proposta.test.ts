import { criarDb, criarPool, eq, eventos, pautas, voluntarios, type Db } from '@lumens/db';
import { criarBancoEmMemoria, criarBancoTemporario } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarEstudanteVerificado, criarPauta, tornarOwner } from './fabricas';
import {
  propostasAbertas,
  publicarProposta,
  registrarExecucaoProposta,
  registrarVoluntario,
} from './proposta';
import { transicionarStatus } from './status';

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

// Concorrência precisa de duas conexões ao mesmo tempo, o que o PGlite não tem.
const URL_TESTE = process.env.DATABASE_URL_TESTE;
if (!URL_TESTE && process.env.CI) throw new Error('No CI, defina DATABASE_URL_TESTE.');

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!URL_TESTE)('registrarVoluntario com Postgres de verdade', () => {
  it('a pauta terminando ao mesmo tempo: o voluntário espera e é recusado', async () => {
    const temporario = await criarBancoTemporario(URL_TESTE ?? '');
    // Com tratador de erro: apagar o banco temporário derruba as conexões (57P01).
    const pool = criarPool(
      temporario.url,
      { conexaoMs: 5000, consultaMs: 15_000 },
      () => undefined,
    );
    const real = criarDb(pool);
    try {
      const pauta = await criarPauta(real, { status: 'prometido' });
      const owner = await criarEstudanteVerificado(real);
      await tornarOwner(real, pauta.id, owner.id);
      const r = await real.transaction((tx) =>
        publicarProposta(tx, {
          pautaId: pauta.id,
          porEstudanteId: owner.id,
          descricao: 'Mutirão',
          pessoasNecessarias: 2,
        }),
      );
      if (!r.publicada) throw new Error('não publicou');
      const estudante = await criarEstudanteVerificado(real);

      // A apuração conclui a pauta e segura a trava sem confirmar; o voluntário chega nesse meio.
      let soltarA: () => void = () => undefined;
      const aSegura = new Promise<void>((s) => {
        soltarA = s;
      });
      let avisarQueATravou: () => void = () => undefined;
      const aTravou = new Promise<void>((s) => {
        avisarQueATravou = s;
      });
      const a = real.transaction(async (tx) => {
        await transicionarStatus(tx, {
          pautaId: pauta.id,
          para: 'conquistada',
          origem: 'agendador',
        });
        avisarQueATravou();
        await aSegura;
      });
      await aTravou;
      const b = real.transaction((tx) =>
        registrarVoluntario(tx, { propostaId: r.propostaId, estudanteId: estudante.id }),
      );
      await esperar(300); // B já está parado no FOR SHARE
      soltarA();
      const [, rb] = await Promise.all([a, b]);

      expect(rb).toEqual({ registrado: false, motivo: 'proposta_encerrada' });
      expect(
        await real.select().from(voluntarios).where(eq(voluntarios.propostaId, r.propostaId)),
      ).toEqual([]);
    } finally {
      await pool.end();
      await temporario.apagar();
    }
  }, 30_000);
});
