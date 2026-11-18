import { apoios, eventos, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { resumoDaCuradoria } from './curadoria';
import { criarEstudanteVerificado, criarPauta } from '../teste/fabricas';
import { visaoGeralDaCuradoria } from './visao-geral';

let db: Db;
// Quarta-feira; a semana atual começa na segunda 2030-01-07.
const agora = new Date('2030-01-09T12:00:00.000Z');

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

describe('visaoGeralDaCuradoria', () => {
  it('sem dados: zeros em todos os status, 8 semanas zeradas e sem tempo médio', async () => {
    const v = await visaoGeralDaCuradoria(db, agora);
    expect(v.pautasPertoDeVencer).toBe(0);
    expect(v.pautasPorStatus).toHaveLength(9);
    expect(v.pautasPorStatus.every((s) => s.total === 0)).toBe(true);
    expect(v.apoiosPorSemana).toHaveLength(8);
    expect(v.apoiosPorSemana[0]?.semana).toBe('2029-11-19');
    expect(v.apoiosPorSemana[7]?.semana).toBe('2030-01-07');
    expect(v.apoiosPorSemana.every((s) => s.apoios === 0)).toBe(true);
    expect(v.tempoMedioAteDecisaoMs).toBeNull();
  });

  it('conta prazos, status, apoios por semana (segunda a domingo em UTC) e tempo até a decisão', async () => {
    const atrasada = await criarPauta(db, {
      status: 'em_curadoria',
      criadaEm: new Date('2030-01-08T10:00:00.000Z'), // venceu há 2 h
    });
    // Vence às 14h: dentro das próximas 6 h.
    await criarPauta(db, {
      status: 'em_curadoria',
      criadaEm: new Date('2030-01-08T14:00:00.000Z'),
    });
    // Vence amanhã às 11h: ainda longe.
    await criarPauta(db, {
      status: 'em_curadoria',
      criadaEm: new Date('2030-01-09T11:00:00.000Z'),
    });
    const aprovada = await criarPauta(db, {
      status: 'juntando_apoios',
      criadaEm: new Date('2030-01-08T00:00:00.000Z'),
    });
    await criarPauta(db, { status: 'cobrando' });
    await db.insert(eventos).values({
      pautaId: aprovada.id,
      tipo: 'pauta_aprovada',
      origem: 'curadoria',
      criadoEm: new Date('2030-01-08T06:00:00.000Z'), // 6 h depois de criada
    });
    const recusada = await criarPauta(db, {
      status: 'recusada',
      criadaEm: new Date('2030-01-08T00:00:00.000Z'),
    });
    await db.insert(eventos).values({
      pautaId: recusada.id,
      tipo: 'pauta_recusada',
      origem: 'curadoria',
      criadoEm: new Date('2030-01-08T10:00:00.000Z'), // 10 h depois
    });

    const e1 = await criarEstudanteVerificado(db);
    const e2 = await criarEstudanteVerificado(db);
    const e3 = await criarEstudanteVerificado(db);
    await db.insert(apoios).values([
      // Domingo 06/01 23:59 UTC: ainda na semana de 31/12.
      {
        pautaId: aprovada.id,
        estudanteId: e1.id,
        origem: 'site',
        criadoEm: new Date('2030-01-06T23:59:00.000Z'),
      },
      // Segunda 07/01 00:00 UTC: semana atual.
      {
        pautaId: aprovada.id,
        estudanteId: e2.id,
        origem: 'bot',
        criadoEm: new Date('2030-01-07T00:00:00.000Z'),
      },
      {
        pautaId: aprovada.id,
        estudanteId: e3.id,
        origem: 'bot',
        criadoEm: new Date('2030-01-08T09:00:00.000Z'),
      },
    ]);

    const v = await visaoGeralDaCuradoria(db, agora);
    expect(v.pautasPertoDeVencer).toBe(1);
    const total = (s: string) => v.pautasPorStatus.find((x) => x.status === s)?.total;
    expect(total('em_curadoria')).toBe(3);
    expect(total('juntando_apoios')).toBe(1);
    expect(total('cobrando')).toBe(1);
    expect(total('recusada')).toBe(1);
    expect(v.apoiosPorSemana.at(-1)).toEqual({ semana: '2030-01-07', apoios: 2 });
    expect(v.apoiosPorSemana.at(-2)).toEqual({ semana: '2029-12-31', apoios: 1 });
    expect(v.decisoesNoPeriodo).toBe(2);
    expect(v.tempoMedioAteDecisaoMs).toBe(8 * 3_600_000);

    // Bate com o resumo usado nos cartões de topo.
    const resumo = await resumoDaCuradoria(db, agora);
    expect(resumo.pautasADecidir).toBe(total('em_curadoria'));
    expect(resumo.pautasAtrasadas).toBeGreaterThanOrEqual(1);
    expect(atrasada.status).toBe('em_curadoria');
  });
});
