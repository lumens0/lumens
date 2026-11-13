import {
  apoios,
  disparos,
  eq,
  estudantes,
  eventos,
  pautas,
  promessas,
  respostasConferencia,
  type Db,
} from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { encerrarConferencia } from './conferencia-apuracao';
import { criarCurador, criarPauta } from '../teste/fabricas';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

const ABRE = new Date('2026-12-10T03:00:00.000Z');
const FECHA = new Date('2026-12-17T03:00:00.000Z');
const ANTES = new Date('2026-12-01T12:00:00.000Z');
const DEPOIS_DE_FECHAR = new Date('2026-12-17T04:00:00.000Z');

let seq = 0;

async function estudantesNovos(n: number): Promise<string[]> {
  if (n === 0) return [];
  const linhas = await db
    .insert(estudantes)
    .values(
      Array.from({ length: n }, () => {
        const k = `apuracao-${String(++seq)}`;
        return { telefoneHmac: k, telefoneCifrado: k, verificadoEm: ANTES };
      }),
    )
    .returning({ id: estudantes.id });
  return linhas.map((l) => l.id);
}

/**
 * Pauta em `prometido` com a promessa aberta de 10/12 a 17/12, `apoiadores` que apoiaram antes de
 * abrir e as respostas pedidas, nessa ordem, dadas pelos primeiros apoiadores.
 */
async function cenario(
  apoiadores: number,
  respostas: { sim: number; em_parte: number; nao: number },
) {
  const pauta = await criarPauta(db, { status: 'prometido' });
  const curador = await criarCurador(db);
  const [promessa] = await db
    .insert(promessas)
    .values({
      pautaId: pauta.id,
      resumo: 'Trocar as lâmpadas.',
      dataEntrega: '2026-12-10',
      fonte: 'Fala.BR',
      registradaPor: curador.id,
      conferenciaAbreEm: ABRE,
      conferenciaFechaEm: FECHA,
    })
    .returning({ id: promessas.id });
  if (promessa === undefined) throw new Error('promessa não criada');

  const ids = await estudantesNovos(apoiadores);
  if (ids.length > 0) {
    await db.insert(apoios).values(
      ids.map((estudanteId) => ({
        pautaId: pauta.id,
        estudanteId,
        origem: 'bot' as const,
        criadoEm: ANTES,
      })),
    );
  }

  const valores = [
    ...Array<'sim'>(respostas.sim).fill('sim'),
    ...Array<'em_parte'>(respostas.em_parte).fill('em_parte'),
    ...Array<'nao'>(respostas.nao).fill('nao'),
  ];
  if (valores.length > 0) {
    await db.insert(respostasConferencia).values(
      valores.map((resposta, i) => ({
        promessaId: promessa.id,
        estudanteId: ids[i] ?? '',
        resposta,
      })),
    );
  }

  return { pauta, promessaId: promessa.id, ids };
}

const encerrar = (promessaId: string, agora = DEPOIS_DE_FECHAR) =>
  db.transaction((tx) => encerrarConferencia(tx, { promessaId, agora }));

const statusDa = async (id: string) =>
  (await db.select({ status: pautas.status }).from(pautas).where(eq(pautas.id, id)))[0]?.status;

const resultadoDa = async (id: string) =>
  (
    await db.select({ resultado: promessas.resultado }).from(promessas).where(eq(promessas.id, id))
  )[0]?.resultado;

describe('encerrarConferencia (RN10), exemplos do card com 100 apoiadores', () => {
  it.each([
    ['15 sim, 3 em parte, 2 não', { sim: 15, em_parte: 3, nao: 2 }, 'conquistada'],
    ['5 sim, 12 em parte, 3 não', { sim: 5, em_parte: 12, nao: 3 }, 'entregue_em_parte'],
    ['4 sim, 4 em parte, 12 não', { sim: 4, em_parte: 4, nao: 12 }, 'descumprida'],
    ['empate 10 sim x 10 não', { sim: 10, em_parte: 0, nao: 10 }, 'entregue_em_parte'],
    ['exatamente 10% com maioria sim', { sim: 6, em_parte: 2, nao: 2 }, 'conquistada'],
  ] as const)('%s → %s', async (_, respostas, esperado) => {
    const { pauta, promessaId } = await cenario(100, respostas);

    const r = await encerrar(promessaId);

    expect(r).toMatchObject({ apurada: true, resultado: esperado, apoiadores: 100 });
    expect(await resultadoDa(promessaId)).toBe(esperado);
    expect(await statusDa(pauta.id)).toBe(esperado);
  });

  it('menos de 10% respondeu: não vira conquista; a promessa fecha como sem_quorum', async () => {
    const { pauta, promessaId } = await cenario(100, { sim: 8, em_parte: 0, nao: 0 });

    const r = await encerrar(promessaId);

    expect(r).toMatchObject({ apurada: true, resultado: 'sem_quorum', respondentes: 8 });
    expect(await resultadoDa(promessaId)).toBe('sem_quorum');
    expect(await statusDa(pauta.id)).toBe('prometido');
  });
});

describe('encerrarConferencia, regras de execução', () => {
  it('grava conferencia_apurada só com números agregados', async () => {
    const { pauta, promessaId } = await cenario(100, { sim: 15, em_parte: 3, nao: 2 });
    await encerrar(promessaId);

    const evento = (
      await db
        .select({ tipo: eventos.tipo, dados: eventos.dados, publico: eventos.publico })
        .from(eventos)
        .where(eq(eventos.pautaId, pauta.id))
    ).find((e) => e.tipo === 'conferencia_apurada');
    expect(evento).toEqual({
      tipo: 'conferencia_apurada',
      dados: { promessa_id: promessaId, resultado: 'conquistada', total_respostas: 20 },
      publico: true,
    });
  });

  it('segunda apuração da mesma promessa não muda nada', async () => {
    const { pauta, promessaId } = await cenario(100, { sim: 15, em_parte: 3, nao: 2 });
    await encerrar(promessaId);
    const eventosAntes = await db.select().from(eventos).where(eq(eventos.pautaId, pauta.id));

    expect(await encerrar(promessaId)).toEqual({ apurada: false, motivo: 'ja_apurada' });
    expect(await db.select().from(eventos).where(eq(eventos.pautaId, pauta.id))).toHaveLength(
      eventosAntes.length,
    );
  });

  it('antes de a janela fechar, não apura', async () => {
    const { pauta, promessaId } = await cenario(100, { sim: 15, em_parte: 3, nao: 2 });

    expect(await encerrar(promessaId, new Date('2026-12-16T12:00:00.000Z'))).toEqual({
      apurada: false,
      motivo: 'conferencia_aberta',
    });
    expect(await resultadoDa(promessaId)).toBeNull();
    expect(await statusDa(pauta.id)).toBe('prometido');
  });

  it('quem apoiou depois de a conferência abrir não entra na conta', async () => {
    // 10 apoiadores de antes: 1 "sim" seria 10% de quórum. Os 5 "não" de quem apoiou depois não contam.
    const { pauta, promessaId } = await cenario(10, { sim: 1, em_parte: 0, nao: 0 });
    const tardios = await estudantesNovos(5);
    await db.insert(apoios).values(
      tardios.map((estudanteId) => ({
        pautaId: pauta.id,
        estudanteId,
        origem: 'bot' as const,
        criadoEm: new Date('2026-12-12T12:00:00.000Z'),
      })),
    );
    await db
      .insert(respostasConferencia)
      .values(
        tardios.map((estudanteId) => ({ promessaId, estudanteId, resposta: 'nao' as const })),
      );

    const r = await encerrar(promessaId);

    expect(r).toEqual({ apurada: true, resultado: 'conquistada', respondentes: 1, apoiadores: 10 });
  });

  it('virou conquista: o card de vitória entra na fila para cada apoiador (3.7c)', async () => {
    const { pauta, promessaId, ids } = await cenario(20, { sim: 15, em_parte: 3, nao: 2 });

    await encerrar(promessaId);

    const avisos = await db
      .select({ tipo: disparos.tipo, estudanteId: disparos.estudanteId })
      .from(disparos)
      .where(eq(disparos.aviso, pauta.id));
    expect(avisos.map((a) => a.estudanteId).sort()).toEqual([...ids].sort());
    expect(new Set(avisos.map((a) => a.tipo))).toEqual(new Set(['vitoria']));
  });

  it.each([
    ['entregue em parte', { sim: 5, em_parte: 12, nao: 3 }],
    ['descumprida', { sim: 4, em_parte: 4, nao: 12 }],
    ['sem quórum', { sim: 1, em_parte: 0, nao: 0 }],
  ] as const)('%s: ninguém recebe card de vitória', async (_, respostas) => {
    const { pauta, promessaId } = await cenario(20, respostas);

    await encerrar(promessaId);

    expect(await db.select().from(disparos).where(eq(disparos.aviso, pauta.id))).toHaveLength(0);
  });

  it('promessa que não existe', async () => {
    expect(await encerrar('00000000-0000-0000-0000-000000000000')).toEqual({
      apurada: false,
      motivo: 'promessa_inexistente',
    });
  });
});
