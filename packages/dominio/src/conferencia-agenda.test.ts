import {
  and,
  apoios,
  disparos,
  eq,
  estudantes,
  eventos,
  pautas,
  promessas,
  type Db,
} from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  abrirConferencia,
  fecharConferencia,
  promessasParaAbrir,
  promessasParaFechar,
} from './conferencia-agenda';
import { registrarRespostaConferencia } from './conferencia-registro';
import { criarCurador, criarEstudanteVerificado, criarPauta } from './fabricas';
import { registrarPromessa } from './promessa';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
}, 30_000);

const DIA = 86_400_000;
const HORA = 3_600_000;
/** 00:00 de 20/11/2026 em Maceió: é quando a conferência de uma entrega em 20/11 abre. */
const ABRE = new Date('2026-11-20T03:00:00.000Z');
const depois = (ms: number) => new Date(ABRE.getTime() + ms);

/** Pauta em `prometido` com `n` apoiadores de antes da abertura e a promessa para 20/11. */
async function cenario(n: number) {
  const pauta = await criarPauta(db, { status: 'cobrando', titulo: 'Mais mesas no RU' });
  const curador = await criarCurador(db);
  const apoiadores: string[] = [];
  for (let i = 0; i < n; i++) {
    const e = await criarEstudanteVerificado(db);
    await db
      .insert(apoios)
      .values({ pautaId: pauta.id, estudanteId: e.id, origem: 'bot', criadoEm: depois(-10 * DIA) });
    apoiadores.push(e.id);
  }
  const { promessaId } = await db.transaction((tx) =>
    registrarPromessa(tx, {
      pautaId: pauta.id,
      resumo: 'abrir mais 40 lugares',
      dataEntrega: '2026-11-20',
      fonte: 'ofício 12/2026',
      registradaPor: curador.id,
    }),
  );
  return { pautaId: pauta.id, promessaId, apoiadores };
}

const abrir = (promessaId: string, agora: Date) =>
  db.transaction((tx) => abrirConferencia(tx, { promessaId, agora }));
const fechar = (promessaId: string, agora: Date) =>
  db.transaction((tx) => fecharConferencia(tx, { promessaId, agora }));
const responder = (
  promessaId: string,
  estudanteId: string,
  agora: Date,
  resposta = 'sim' as const,
) =>
  db.transaction((tx) =>
    registrarRespostaConferencia(tx, { promessaId, estudanteId, resposta, agora }),
  );

const avisosDa = (aviso: string) =>
  db
    .select({ estudanteId: disparos.estudanteId, parametros: disparos.parametros })
    .from(disparos)
    // Só os da conferência: registrar a promessa também enfileira `resposta_oficial` com o mesmo `aviso`.
    .where(and(eq(disparos.aviso, aviso), eq(disparos.tipo, 'conferencia')));

const eventosDa = async (pautaId: string, tipo: string) =>
  (await db.select().from(eventos).where(eq(eventos.pautaId, pautaId))).filter(
    (e) => e.tipo === tipo,
  );

const promessa = async (id: string) =>
  (await db.select().from(promessas).where(eq(promessas.id, id)))[0];

const statusDa = async (pautaId: string) =>
  (await db.select({ status: pautas.status }).from(pautas).where(eq(pautas.id, pautaId)))[0]
    ?.status;

describe('abertura da conferência', () => {
  it('abre na data, registra o evento e avisa quem apoiava', async () => {
    const { pautaId, promessaId, apoiadores } = await cenario(3);

    const resultado = await abrir(promessaId, depois(10 * 60_000));

    expect(resultado).toMatchObject({ aberta: true, avisos: 3 });
    const [evento] = await eventosDa(pautaId, 'conferencia_aberta');
    expect(evento?.dados).toEqual({
      promessa_id: promessaId,
      fecha_em: depois(7 * DIA).toISOString(),
    });
    const avisos = await avisosDa(promessaId);
    expect(avisos.map((a) => a.estudanteId).sort()).toEqual([...apoiadores].sort());
    // Título, dia prometido, resumo e o último dia para responder (a janela fecha à 0h do dia 27).
    expect(avisos[0]?.parametros).toEqual([
      'Mais mesas no RU',
      '20/11/2026',
      'abrir mais 40 lugares',
      '26/11/2026',
    ]);
  });

  it('não abre antes da data', async () => {
    const { promessaId } = await cenario(1);

    expect(await abrir(promessaId, depois(-HORA))).toEqual({ aberta: false, motivo: 'ainda_nao' });
    expect(await promessasParaAbrir(db, depois(-HORA))).not.toContain(promessaId);
  });

  it('abrir de novo não repete evento nem aviso', async () => {
    const { pautaId, promessaId } = await cenario(2);
    await abrir(promessaId, depois(0));

    expect(await abrir(promessaId, depois(HORA))).toEqual({ aberta: false, motivo: 'ja_aberta' });
    expect(await eventosDa(pautaId, 'conferencia_aberta')).toHaveLength(1);
    expect(await avisosDa(promessaId)).toHaveLength(2);
    expect(await promessasParaAbrir(db, depois(HORA))).not.toContain(promessaId);
  });

  it('quem apoiou depois da abertura ou saiu do sistema não é chamado', async () => {
    const { pautaId, promessaId, apoiadores } = await cenario(2);
    const tardio = await criarEstudanteVerificado(db);
    await db
      .insert(apoios)
      .values({ pautaId, estudanteId: tardio.id, origem: 'bot', criadoEm: depois(HORA) });
    await db
      .update(estudantes)
      .set({ saiuEm: depois(-DIA) })
      .where(eq(estudantes.id, apoiadores[0] ?? ''));

    await abrir(promessaId, depois(2 * HORA));

    expect((await avisosDa(promessaId)).map((a) => a.estudanteId)).toEqual([apoiadores[1]]);
  });

  it('aberta com atraso, o fecho anda junto e a semana fica inteira', async () => {
    // O agendador ficou fora do ar três dias e cinco horas (SCRUM-239). Sete dias depois são as
    // 5h de 30/11; a janela vai até a meia-noite seguinte, para "responda até 30/11" valer.
    const { pautaId, promessaId } = await cenario(1);
    const agora = depois(3 * DIA + 5 * HORA);

    const resultado = await abrir(promessaId, agora);

    const fechaEm = depois(11 * DIA);
    expect(resultado).toMatchObject({ aberta: true, fechaEm });
    expect((await promessa(promessaId))?.conferenciaFechaEm).toEqual(fechaEm);
    const [evento] = await eventosDa(pautaId, 'conferencia_aberta');
    expect(evento?.dados).toMatchObject({ fecha_em: fechaEm.toISOString() });
  });

  it('atraso de até uma hora é o ritmo do agendador e não mexe no fecho', async () => {
    const { promessaId } = await cenario(1);

    await abrir(promessaId, depois(50 * 60_000));

    expect((await promessa(promessaId))?.conferenciaFechaEm).toEqual(depois(7 * DIA));
  });

  it('promessasParaAbrir acha a que venceu e ainda não abriu', async () => {
    const { promessaId } = await cenario(1);

    expect(await promessasParaAbrir(db, depois(HORA))).toContain(promessaId);
  });
});

describe('fecho da conferência', () => {
  it('com quórum, apura e aplica o resultado', async () => {
    const { pautaId, promessaId, apoiadores } = await cenario(10);
    await abrir(promessaId, depois(0));
    await responder(promessaId, apoiadores[0] ?? '', depois(DIA));
    await responder(promessaId, apoiadores[1] ?? '', depois(DIA));

    const resultado = await fechar(promessaId, depois(7 * DIA));

    expect(resultado).toMatchObject({ apurada: true, resultado: 'conquistada' });
    expect(await statusDa(pautaId)).toBe('conquistada');
  });

  it('sem quórum na primeira rodada, reabre por mais sete dias para quem não respondeu', async () => {
    const { pautaId, promessaId, apoiadores } = await cenario(20);
    await abrir(promessaId, depois(0));
    await responder(promessaId, apoiadores[0] ?? '', depois(DIA));
    const agora = depois(7 * DIA + HORA);

    const resultado = await fechar(promessaId, agora);

    // Sete dias a partir de agora, fechando na meia-noite seguinte (00h de 05/12).
    const fechaEm = depois(15 * DIA);
    expect(resultado).toEqual({ apurada: false, motivo: 'reaberta', fechaEm, avisos: 19 });
    const atual = await promessa(promessaId);
    expect(atual?.resultado).toBeNull();
    expect(atual?.conferenciaFechaEm).toEqual(fechaEm);
    expect(await statusDa(pautaId)).toBe('prometido');
    expect(await eventosDa(pautaId, 'conferencia_aberta')).toHaveLength(2);
    // A apuração que daria sem quórum foi desfeita junto com o savepoint.
    expect(await eventosDa(pautaId, 'conferencia_apurada')).toHaveLength(0);
    const reaviso = await avisosDa(`${promessaId}:reaberta`);
    expect(reaviso.map((a) => a.estudanteId)).not.toContain(apoiadores[0]);
  });

  it('reaberta, quem não tinha respondido ainda pode responder', async () => {
    const { promessaId, apoiadores } = await cenario(20);
    await abrir(promessaId, depois(0));
    await fechar(promessaId, depois(7 * DIA));

    const resposta = await responder(promessaId, apoiadores[5] ?? '', depois(9 * DIA));

    expect(resposta).toMatchObject({ registrada: true });
  });

  it('sem quórum na segunda rodada, fecha como sem_quorum e a pauta fica em prometido', async () => {
    const { pautaId, promessaId } = await cenario(20);
    await abrir(promessaId, depois(0));
    await fechar(promessaId, depois(7 * DIA));

    const resultado = await fechar(promessaId, depois(14 * DIA));

    expect(resultado).toMatchObject({ apurada: true, resultado: 'sem_quorum' });
    expect((await promessa(promessaId))?.resultado).toBe('sem_quorum');
    expect(await statusDa(pautaId)).toBe('prometido');
  });

  it('não fecha conferência que nunca abriu', async () => {
    const { promessaId } = await cenario(1);

    expect(await fechar(promessaId, depois(8 * DIA))).toEqual({
      apurada: false,
      motivo: 'nao_aberta',
    });
    expect(await promessasParaFechar(db, depois(8 * DIA))).not.toContain(promessaId);
  });

  it('promessasParaFechar acha só a aberta que venceu', async () => {
    const { promessaId } = await cenario(1);
    await abrir(promessaId, depois(0));

    expect(await promessasParaFechar(db, depois(6 * DIA))).not.toContain(promessaId);
    expect(await promessasParaFechar(db, depois(7 * DIA))).toContain(promessaId);
  });

  it('fechar duas vezes não apura duas vezes', async () => {
    const { pautaId, promessaId, apoiadores } = await cenario(10);
    await abrir(promessaId, depois(0));
    await responder(promessaId, apoiadores[0] ?? '', depois(DIA));
    await fechar(promessaId, depois(7 * DIA));

    expect(await fechar(promessaId, depois(8 * DIA))).toEqual({
      apurada: false,
      motivo: 'ja_apurada',
    });
    expect(await eventosDa(pautaId, 'conferencia_apurada')).toHaveLength(1);
  });
});
