import { apoios, curadores, eq, estudantes, pautas, promessas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { registrarPromessa, registrarRespostaConferencia } from '@lumens/dominio';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarLogger } from '../logger';
import { JOBS } from '../queue';
import { GATILHOS_CRON, GATILHOS_TZ, registerGatilhosJob, rodarGatilhos } from './gatilhos';

let db: Db;
const logger = criarLogger('silent');

beforeAll(async () => {
  db = await criarBancoEmMemoria();
}, 30_000);

const DIA = 86_400_000;
/** 00:00 de 20/11/2026 em Maceió. */
const ABRE = new Date('2026-11-20T03:00:00.000Z');
const depois = (ms: number) => new Date(ABRE.getTime() + ms);

let seq = 0;
const unico = () => String(++seq);

/** Pauta em `prometido` com `n` apoiadores e promessa de entrega em 20/11. */
async function promessaCom(n: number) {
  const [pauta] = await db
    .insert(pautas)
    .values({
      slug: `pauta-${unico()}`,
      titulo: 'Bebedouro do bloco 12',
      descricao: 'Quebrado há meses.',
      categoria: 'infraestrutura',
      status: 'cobrando',
      meta: 30,
    })
    .returning();
  const [curador] = await db
    .insert(curadores)
    .values({ emailHmac: `c-${unico()}`, emailCifrado: 'x', nome: 'Curadoria' })
    .returning();
  if (pauta === undefined || curador === undefined) throw new Error('cenário incompleto');
  const apoiadores: string[] = [];
  for (let i = 0; i < n; i++) {
    const [e] = await db
      .insert(estudantes)
      .values({
        telefoneHmac: `t-${unico()}`,
        telefoneCifrado: 'x',
        verificadoEm: depois(-9 * DIA),
      })
      .returning();
    if (e === undefined) throw new Error('estudante não criado');
    await db
      .insert(apoios)
      .values({ pautaId: pauta.id, estudanteId: e.id, origem: 'bot', criadoEm: depois(-DIA) });
    apoiadores.push(e.id);
  }
  const { promessaId } = await db.transaction((tx) =>
    registrarPromessa(tx, {
      pautaId: pauta.id,
      resumo: 'trocar o bebedouro',
      dataEntrega: '2026-11-20',
      fonte: 'ofício',
      registradaPor: curador.id,
    }),
  );
  return { pautaId: pauta.id, promessaId, apoiadores };
}

const resultadoDa = async (promessaId: string) =>
  (await db.select().from(promessas).where(eq(promessas.id, promessaId)))[0]?.resultado;

describe('registerGatilhosJob', () => {
  it('cria a fila e agenda a rodada a cada dez minutos no fuso de Maceió', async () => {
    const chamadas: unknown[][] = [];
    let worker: (() => Promise<unknown>) | undefined;
    const boss = {
      getQueue: () => Promise.resolve(null),
      createQueue: (...a: unknown[]) => {
        chamadas.push(['createQueue', ...a]);
        return Promise.resolve();
      },
      schedule: (...a: unknown[]) => {
        chamadas.push(['schedule', ...a]);
        return Promise.resolve();
      },
      work: (_nome: string, h: () => Promise<unknown>) => {
        worker = h;
        return Promise.resolve('w1');
      },
    };

    await registerGatilhosJob(boss as unknown as Parameters<typeof registerGatilhosJob>[0], {
      db,
      logger,
      agora: () => depois(-30 * DIA),
    });

    expect(chamadas).toEqual([
      ['createQueue', JOBS.gatilhosDeData],
      ['schedule', JOBS.gatilhosDeData, GATILHOS_CRON, null, { tz: GATILHOS_TZ }],
    ]);
    expect(await worker?.()).toMatchObject({ falhas: 0 });
  });
});

describe('rodarGatilhos', () => {
  it('abre na data e apura sete dias depois', async () => {
    const { promessaId, apoiadores } = await promessaCom(10);

    const abertura = await rodarGatilhos(db, logger, depois(5 * 60_000));
    expect(abertura.conferenciasAbertas).toBeGreaterThanOrEqual(1);

    await db.transaction((tx) =>
      registrarRespostaConferencia(tx, {
        promessaId,
        estudanteId: apoiadores[0] ?? '',
        resposta: 'sim',
        agora: depois(DIA),
      }),
    );
    const fecho = await rodarGatilhos(db, logger, depois(7 * DIA + 5 * 60_000));

    expect(fecho.conferenciasApuradas).toBeGreaterThanOrEqual(1);
    expect(await resultadoDa(promessaId)).toBe('conquistada');
  });

  it('rodar duas vezes seguidas não faz nada da segunda', async () => {
    await promessaCom(3);
    await rodarGatilhos(db, logger, depois(DIA));

    const segunda = await rodarGatilhos(db, logger, depois(DIA + 60_000));

    expect(segunda).toMatchObject({ conferenciasAbertas: 0, conferenciasApuradas: 0 });
  });

  it('uma promessa com erro não impede as outras, e a rodada acusa a falha', async () => {
    const quebrada = await promessaCom(10);
    const boa = await promessaCom(10);
    await rodarGatilhos(db, logger, depois(60_000)).catch(() => undefined);
    for (const p of [quebrada, boa]) {
      await db.transaction((tx) =>
        registrarRespostaConferencia(tx, {
          promessaId: p.promessaId,
          estudanteId: p.apoiadores[0] ?? '',
          resposta: 'sim',
          agora: depois(DIA),
        }),
      );
    }
    // Status fora do lugar: a transição para `conquistada` é recusada e a apuração lança.
    await db.update(pautas).set({ status: 'cobrando' }).where(eq(pautas.id, quebrada.pautaId));

    await expect(rodarGatilhos(db, logger, depois(7 * DIA + 60_000))).rejects.toThrow(
      /gatilho\(s\) de data falharam/,
    );

    expect(await resultadoDa(boa.promessaId)).toBe('conquistada');
    expect(await resultadoDa(quebrada.promessaId)).toBeNull();
  });
});
