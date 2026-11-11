import {
  and,
  apoios,
  criarDb,
  criarPool,
  disparos,
  eq,
  estudantes,
  eventos,
  isNull,
  pautas,
  promessas,
  propostas,
  type Db,
} from '@lumens/db';
import { criarBancoEmMemoria, criarBancoTemporario } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { registrarProtocolo } from './caminho-registro';
import { abrirCaminho } from './caminhos';
import { criarCurador, criarEstudanteVerificado, criarPauta, tornarOwner } from './fabricas';
import { RESUMO_NO_AVISO_MAXIMO, registrarPromessa } from './promessa';
import { registrarExecucaoProposta } from './proposta';
import { transicionarStatus } from './status';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

const lerPauta = async (id: string) => (await db.select().from(pautas).where(eq(pautas.id, id)))[0];
const eventosDa = async (id: string) =>
  db
    .select({ tipo: eventos.tipo, dados: eventos.dados })
    .from(eventos)
    .where(eq(eventos.pautaId, id));

/** Pauta com um owner ativo, no status pedido. */
async function pautaComOwner(status: Parameters<typeof criarPauta>[1] = {}) {
  const pauta = await criarPauta(db, status);
  const owner = await criarEstudanteVerificado(db);
  await tornarOwner(db, pauta.id, owner.id);
  return { pauta, owner };
}

describe('abrirCaminho (RN07)', () => {
  it('Fala.BR e comunidade abrem na mesma pauta, em qualquer ordem e antes da meta', async () => {
    const { pauta, owner } = await pautaComOwner({ status: 'juntando_apoios' });

    const comunidade = await db.transaction((tx) =>
      abrirCaminho(tx, { pautaId: pauta.id, tipo: 'comunidade', porEstudanteId: owner.id }),
    );
    const falabr = await db.transaction((tx) =>
      abrirCaminho(tx, { pautaId: pauta.id, tipo: 'falabr', porEstudanteId: owner.id }),
    );

    expect(comunidade).toMatchObject({ aberto: true });
    expect(falabr).toMatchObject({ aberto: true });
    expect((await eventosDa(pauta.id)).map((e) => e.tipo)).toEqual([
      'caminho_aberto',
      'caminho_aberto',
    ]);
    // Abrir caminho não mexe no status.
    expect((await lerPauta(pauta.id))?.status).toBe('juntando_apoios');
  });

  it('quem não é owner não abre caminho', async () => {
    const { pauta } = await pautaComOwner();
    const apoiador = await criarEstudanteVerificado(db);

    const r = await db.transaction((tx) =>
      abrirCaminho(tx, { pautaId: pauta.id, tipo: 'falabr', porEstudanteId: apoiador.id }),
    );

    expect(r).toEqual({ aberto: false, motivo: 'nao_e_owner' });
    expect(await eventosDa(pauta.id)).toEqual([]);
  });
});

describe('registrarProtocolo ligado ao status (RN08)', () => {
  async function caminhoFalabr(status: 'juntando_apoios' | 'meta_batida' | 'cobrando') {
    const { pauta, owner } = await pautaComOwner({ status });
    const r = await db.transaction((tx) =>
      abrirCaminho(tx, { pautaId: pauta.id, tipo: 'falabr', porEstudanteId: owner.id }),
    );
    if (!r.aberto) throw new Error('caminho não abriu');
    return { pauta, caminhoId: r.caminhoId };
  }

  it('protocolo em 01/11 vence em 01/12 e, prorrogado, em 31/12', async () => {
    const { caminhoId } = await caminhoFalabr('juntando_apoios');
    const r = await db.transaction((tx) =>
      registrarProtocolo(tx, {
        caminhoId,
        protocolo: '23546.000001/2026-11',
        abertoEm: '2026-11-01',
      }),
    );
    expect(r).toMatchObject({ registrado: true, prazo: '2026-12-01' });

    const outro = await caminhoFalabr('juntando_apoios');
    const prorrogado = await db.transaction((tx) =>
      registrarProtocolo(tx, {
        caminhoId: outro.caminhoId,
        protocolo: '23546.000002/2026-11',
        abertoEm: '2026-11-01',
        prorrogado: true,
      }),
    );
    expect(prorrogado).toMatchObject({ registrado: true, prazo: '2026-12-31' });
  });

  it.each(['juntando_apoios', 'meta_batida'] as const)(
    'protocolar leva a pauta de %s para cobrando e registra o protocolo',
    async (status) => {
      const { pauta, caminhoId } = await caminhoFalabr(status);

      await db.transaction((tx) =>
        registrarProtocolo(tx, {
          caminhoId,
          protocolo: '23546.000003/2026-11',
          abertoEm: '2026-11-01',
        }),
      );

      expect((await lerPauta(pauta.id))?.status).toBe('cobrando');
      const tipos = (await eventosDa(pauta.id)).map((e) => e.tipo);
      expect(tipos).toEqual(['caminho_aberto', 'protocolo_registrado', 'status_alterado']);
    },
  );

  it('pauta já em cobrando fica onde está', async () => {
    const { pauta, caminhoId } = await caminhoFalabr('cobrando');

    await db.transaction((tx) =>
      registrarProtocolo(tx, {
        caminhoId,
        protocolo: '23546.000004/2026-11',
        abertoEm: '2026-11-01',
      }),
    );

    expect((await lerPauta(pauta.id))?.status).toBe('cobrando');
    expect((await eventosDa(pauta.id)).map((e) => e.tipo)).toEqual([
      'caminho_aberto',
      'protocolo_registrado',
    ]);
  });

  it('reenviar o mesmo protocolo não gera evento de novo', async () => {
    const { pauta, caminhoId } = await caminhoFalabr('juntando_apoios');
    const entrada = { caminhoId, protocolo: '23546.000005/2026-11', abertoEm: '2026-11-01' };
    await db.transaction((tx) => registrarProtocolo(tx, entrada));
    await db.transaction((tx) => registrarProtocolo(tx, entrada));

    const protocolos = (await eventosDa(pauta.id)).filter((e) => e.tipo === 'protocolo_registrado');
    expect(protocolos).toHaveLength(1);
  });

  it('o evento do protocolo não leva nenhum dado de apoiador', async () => {
    const { pauta, caminhoId } = await caminhoFalabr('juntando_apoios');
    await db.transaction((tx) =>
      registrarProtocolo(tx, {
        caminhoId,
        protocolo: '23546.000006/2026-11',
        abertoEm: '2026-11-01',
      }),
    );

    const evento = (await eventosDa(pauta.id)).find((e) => e.tipo === 'protocolo_registrado');
    expect(evento?.dados).toEqual({ caminho_id: caminhoId, protocolo: '23546.000006/2026-11' });
  });
});

describe('registrarExecucaoProposta (RN09)', () => {
  it('vira conquista parcial na linha do tempo e o status da pauta não muda', async () => {
    const pauta = await criarPauta(db, { status: 'cobrando' });
    const [proposta] = await db
      .insert(propostas)
      .values({ pautaId: pauta.id, descricao: 'Mutirão de limpeza', pessoasNecessarias: 5 })
      .returning({ id: propostas.id });
    if (proposta === undefined) throw new Error('proposta não criada');

    const r = await db.transaction((tx) =>
      registrarExecucaoProposta(tx, { propostaId: proposta.id }),
    );
    const repetida = await db.transaction((tx) =>
      registrarExecucaoProposta(tx, { propostaId: proposta.id }),
    );

    expect(r).toEqual({ executada: true });
    expect(repetida).toEqual({ executada: false, motivo: 'ja_executada' });
    expect((await lerPauta(pauta.id))?.status).toBe('cobrando');
    expect(await eventosDa(pauta.id)).toEqual([
      { tipo: 'proposta_executada', dados: { proposta_id: proposta.id } },
    ]);
  });
});

describe('registrarPromessa (RN13)', () => {
  const nova = (pautaId: string, registradaPor: string, dataEntrega = '2026-12-10') => ({
    pautaId,
    resumo: 'A reitoria vai trocar as lâmpadas.',
    dataEntrega,
    fonte: 'Resposta no Fala.BR',
    registradaPor,
  });

  it('leva a pauta a prometido e agenda a conferência na data de entrega, por 7 dias', async () => {
    const pauta = await criarPauta(db, { status: 'cobrando' });
    const curador = await criarCurador(db);

    const r = await db.transaction((tx) => registrarPromessa(tx, nova(pauta.id, curador.id)));

    // 10/12 à meia-noite em Maceió (UTC−3) é 03:00 UTC.
    expect(r.conferenciaAbreEm.toISOString()).toBe('2026-12-10T03:00:00.000Z');
    expect(r.conferenciaFechaEm.toISOString()).toBe('2026-12-17T03:00:00.000Z');
    expect((await lerPauta(pauta.id))?.status).toBe('prometido');
    expect((await eventosDa(pauta.id)).map((e) => e.tipo)).toEqual([
      'status_alterado',
      'promessa_registrada',
    ]);
    // Resumo e fonte vão no evento público, para a página da pauta mostrar a resposta oficial.
    const evento = (await eventosDa(pauta.id)).find((e) => e.tipo === 'promessa_registrada');
    expect(evento?.dados).toMatchObject({
      data_entrega: '2026-12-10',
      resumo: 'A reitoria vai trocar as lâmpadas.',
      fonte: 'Resposta no Fala.BR',
    });
  });

  it.each(['entregue_em_parte', 'descumprida'] as const)(
    'nova promessa depois de %s funciona e fica como a única ativa',
    async (status) => {
      const pauta = await criarPauta(db, { status });
      const curador = await criarCurador(db);
      // Promessa anterior já apurada, como a T13 deixa.
      await db.insert(promessas).values({
        ...nova(pauta.id, curador.id, '2026-11-01'),
        conferenciaAbreEm: new Date('2026-11-01T03:00:00Z'),
        conferenciaFechaEm: new Date('2026-11-08T03:00:00Z'),
        resultado: status,
      });

      await db.transaction((tx) => registrarPromessa(tx, nova(pauta.id, curador.id)));

      const ativas = await db
        .select({ dataEntrega: promessas.dataEntrega })
        .from(promessas)
        .where(and(eq(promessas.pautaId, pauta.id), isNull(promessas.resultado)));
      expect(ativas).toEqual([{ dataEntrega: '2026-12-10' }]);
      expect((await lerPauta(pauta.id))?.status).toBe('prometido');
    },
  );

  it('promessa ainda ativa é encerrada como substituida, e a nova fica como a única ativa', async () => {
    const pauta = await criarPauta(db, { status: 'descumprida' });
    const curador = await criarCurador(db);
    await db.insert(promessas).values({
      ...nova(pauta.id, curador.id, '2026-11-01'),
      conferenciaAbreEm: new Date('2026-11-01T03:00:00Z'),
      conferenciaFechaEm: new Date('2026-11-08T03:00:00Z'),
    });

    await db.transaction((tx) => registrarPromessa(tx, nova(pauta.id, curador.id)));

    const todas = await db
      .select({ dataEntrega: promessas.dataEntrega, resultado: promessas.resultado })
      .from(promessas)
      .where(eq(promessas.pautaId, pauta.id));
    expect(todas).toEqual(
      expect.arrayContaining([
        { dataEntrega: '2026-11-01', resultado: 'substituida' },
        { dataEntrega: '2026-12-10', resultado: null },
      ]),
    );
  });

  it('enfileira o aviso de resposta oficial para quem apoia, menos quem saiu do sistema', async () => {
    const pauta = await criarPauta(db, { status: 'cobrando', titulo: 'Lâmpadas do bloco B' });
    const curador = await criarCurador(db);
    const [a, b, saiu] = [
      await criarEstudanteVerificado(db),
      await criarEstudanteVerificado(db),
      await criarEstudanteVerificado(db),
    ];
    await db.update(estudantes).set({ saiuEm: new Date() }).where(eq(estudantes.id, saiu.id));
    await db
      .insert(apoios)
      .values(
        [a, b, saiu].map((e) => ({ pautaId: pauta.id, estudanteId: e.id, origem: 'bot' as const })),
      );

    const r = await db.transaction((tx) => registrarPromessa(tx, nova(pauta.id, curador.id)));

    expect(r.avisados).toBe(2);
    const fila = await db
      .select({
        tipo: disparos.tipo,
        aviso: disparos.aviso,
        estudanteId: disparos.estudanteId,
        modelo: disparos.modelo,
        parametros: disparos.parametros,
      })
      .from(disparos)
      .where(eq(disparos.aviso, r.promessaId));
    expect(fila).toHaveLength(2);
    expect(fila.map((d) => d.estudanteId).sort()).toEqual([a.id, b.id].sort());
    expect(fila[0]).toMatchObject({
      tipo: 'resposta_oficial',
      modelo: 'lumens_resposta_oficial',
      parametros: [
        'Lâmpadas do bloco B',
        'Resposta no Fala.BR',
        'A reitoria vai trocar as lâmpadas.',
        pauta.slug,
      ],
    });
  });

  it('resumo longo vai cortado no aviso, sem passar do teto da Meta (3.6)', async () => {
    const pauta = await criarPauta(db, { status: 'cobrando' });
    const curador = await criarCurador(db);
    const apoiador = await criarEstudanteVerificado(db);
    await db.insert(apoios).values({ pautaId: pauta.id, estudanteId: apoiador.id, origem: 'bot' });
    const longo = `A reitoria respondeu ${'com detalhes '.repeat(60)}.`;

    const r = await db.transaction((tx) =>
      registrarPromessa(tx, { ...nova(pauta.id, curador.id), resumo: longo }),
    );

    const [aviso] = await db.select().from(disparos).where(eq(disparos.aviso, r.promessaId));
    const resumo = aviso?.parametros[2] ?? '';
    expect(Array.from(resumo)).toHaveLength(RESUMO_NO_AVISO_MAXIMO);
    expect(resumo.endsWith('…')).toBe(true);
  });

  it('promessa recusada não deixa aviso na fila', async () => {
    const pauta = await criarPauta(db, { status: 'juntando_apoios' });
    const curador = await criarCurador(db);
    const apoiador = await criarEstudanteVerificado(db);
    await db.insert(apoios).values({ pautaId: pauta.id, estudanteId: apoiador.id, origem: 'bot' });

    await expect(
      db.transaction((tx) => registrarPromessa(tx, nova(pauta.id, curador.id))),
    ).rejects.toMatchObject({ codigo: 'transicao_invalida' });

    const fila = await db.select().from(disparos).where(eq(disparos.estudanteId, apoiador.id));
    expect(fila).toEqual([]);
  });

  it('pauta fora de cobrando não recebe promessa e nada é gravado', async () => {
    const pauta = await criarPauta(db, { status: 'juntando_apoios' });
    const curador = await criarCurador(db);

    await expect(
      db.transaction((tx) => registrarPromessa(tx, nova(pauta.id, curador.id))),
    ).rejects.toMatchObject({ codigo: 'transicao_invalida' });

    const gravadas = await db.select().from(promessas).where(eq(promessas.pautaId, pauta.id));
    expect(gravadas).toEqual([]);
  });

  it.each(['2026-02-31', '10/12/2026', ''])(
    'data de entrega inválida (%j) é recusada',
    async (dia) => {
      const pauta = await criarPauta(db, { status: 'cobrando' });
      const curador = await criarCurador(db);

      await expect(
        db.transaction((tx) => registrarPromessa(tx, nova(pauta.id, curador.id, dia))),
      ).rejects.toMatchObject({ codigo: 'data_invalida' });

      expect((await lerPauta(pauta.id))?.status).toBe('cobrando');
    },
  );
});

// Concorrência precisa de várias conexões ao mesmo tempo, o que o PGlite não tem.
const URL_TESTE = process.env.DATABASE_URL_TESTE;
if (!URL_TESTE && process.env.CI) throw new Error('No CI, defina DATABASE_URL_TESTE.');

describe.skipIf(!URL_TESTE)('registrarProtocolo com Postgres de verdade', () => {
  it('protocolos simultâneos em dois caminhos Fala.BR da mesma pauta: os dois gravam e a pauta vai para cobrando uma vez', async () => {
    const temporario = await criarBancoTemporario(URL_TESTE ?? '');
    // Com tratador de erro: apagar o banco temporário derruba as conexões (57P01).
    const pool = criarPool(
      temporario.url,
      { conexaoMs: 5000, consultaMs: 15_000 },
      () => undefined,
    );
    const real = criarDb(pool);
    try {
      const pauta = await criarPauta(real, { status: 'meta_batida' });
      const owner = await criarEstudanteVerificado(real);
      await tornarOwner(real, pauta.id, owner.id);
      const caminhosIds: string[] = [];
      for (let i = 0; i < 2; i++) {
        const r = await real.transaction((tx) =>
          abrirCaminho(tx, { pautaId: pauta.id, tipo: 'falabr', porEstudanteId: owner.id }),
        );
        if (!r.aberto) throw new Error('caminho não abriu');
        caminhosIds.push(r.caminhoId);
      }

      // Abre as conexões antes da disputa, para as duas transações correrem juntas de verdade.
      await Promise.all(caminhosIds.map(() => pool.query('select pg_sleep(0.05)')));
      const resultados = await Promise.all(
        caminhosIds.map((caminhoId, i) =>
          real.transaction((tx) =>
            registrarProtocolo(tx, {
              caminhoId,
              protocolo: `23546.00000${String(i)}/2026-11`,
              abertoEm: '2026-11-01',
            }),
          ),
        ),
      );

      expect(resultados.every((r) => r.registrado)).toBe(true);
      const [lida] = await real.select().from(pautas).where(eq(pautas.id, pauta.id));
      expect(lida?.status).toBe('cobrando');
      const tipos = (
        await real.select({ tipo: eventos.tipo }).from(eventos).where(eq(eventos.pautaId, pauta.id))
      ).map((e) => e.tipo);
      expect(tipos.filter((t) => t === 'status_alterado')).toHaveLength(1);
      expect(tipos.filter((t) => t === 'protocolo_registrado')).toHaveLength(2);
    } finally {
      await pool.end();
      await temporario.apagar();
    }
  }, 30_000);
});

describe.skipIf(!URL_TESTE)('abrirCaminho com Postgres de verdade', () => {
  it('pauta que vira conquistada no meio da abertura: o caminho espera e é recusado', async () => {
    const temporario = await criarBancoTemporario(URL_TESTE ?? '');
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
      await Promise.all([0, 1].map(() => pool.query('select pg_sleep(0.05)')));

      let abertura: ReturnType<typeof abrirCaminho> | undefined;
      // A apuração segura o lock da pauta; a abertura começa nesse intervalo e só pode ler o
      // status depois do commit da apuração.
      await real.transaction(async (tx) => {
        await transicionarStatus(tx, {
          pautaId: pauta.id,
          para: 'conquistada',
          origem: 'agendador',
        });
        abertura = real.transaction((t2) =>
          abrirCaminho(t2, { pautaId: pauta.id, tipo: 'comunidade', porEstudanteId: owner.id }),
        );
        await new Promise((r) => setTimeout(r, 500));
      });

      expect(await abertura).toEqual({ aberto: false, motivo: 'pauta_fechada' });
      const tipos = (
        await real.select({ tipo: eventos.tipo }).from(eventos).where(eq(eventos.pautaId, pauta.id))
      ).map((e) => e.tipo);
      expect(tipos).not.toContain('caminho_aberto');
    } finally {
      await pool.end();
      await temporario.apagar();
    }
  }, 30_000);
});
