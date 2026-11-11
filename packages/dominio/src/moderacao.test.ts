import { criarDb, criarPool, eq, eventos, relatos, sql, type Db } from '@lumens/db';
import { criarBancoEmMemoria, criarBancoTemporario } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarBloco, criarCurador, criarPauta, criarRelato } from './fabricas';
import { aprovarRelato, listarRelatosPendentes, recusarRelato } from './moderacao';

let db: Db;
let curadorId: string;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
  curadorId = (await criarCurador(db)).id;
});

const relatoDo = async (id: string, banco: Db = db) =>
  (await banco.select().from(relatos).where(eq(relatos.id, id)))[0];

const eventosDa = (pautaId: string, banco: Db = db) =>
  banco
    .select({
      tipo: eventos.tipo,
      dados: eventos.dados,
      origem: eventos.origem,
      publico: eventos.publico,
    })
    .from(eventos)
    .where(eq(eventos.pautaId, pautaId));

describe('listarRelatosPendentes', () => {
  it('agrupa os pendentes por pauta, da pauta mais antiga para a mais nova', async () => {
    const bloco = await criarBloco(db);
    const nova = await criarPauta(db, {
      titulo: 'Bebedouro do bloco 12',
      blocoId: bloco.id,
      criadaEm: new Date('2030-01-02T10:00:00.000Z'),
    });
    const antiga = await criarPauta(db, {
      status: 'em_curadoria',
      criadaEm: new Date('2030-01-01T10:00:00.000Z'),
    });
    const daNova = await criarRelato(db, {
      pautaId: nova.id,
      texto: 'Sem água há dias.',
      fotoChave: 'fotos/bebedouro.jpg',
    });
    const daAntiga = [
      await criarRelato(db, { pautaId: antiga.id }),
      await criarRelato(db, { pautaId: antiga.id }),
    ];

    const fila = (await listarRelatosPendentes(db)).filter((p) =>
      [nova.id, antiga.id].includes(p.id),
    );

    expect(fila).toEqual([
      {
        id: antiga.id,
        titulo: antiga.titulo,
        bloco: null,
        relatos: daAntiga
          .map((r) => ({ id: r.id, texto: r.texto, fotoChave: null, achados: [] }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      },
      {
        id: nova.id,
        titulo: 'Bebedouro do bloco 12',
        bloco: bloco.nome,
        relatos: [
          {
            id: daNova.id,
            texto: 'Sem água há dias.',
            fotoChave: 'fotos/bebedouro.jpg',
            achados: [],
          },
        ],
      },
    ]);
  });

  it('deixa de fora relato já moderado e relato de pauta recusada', async () => {
    const pauta = await criarPauta(db);
    const recusada = await criarPauta(db, { status: 'recusada' });
    const pendente = await criarRelato(db, { pautaId: pauta.id });
    await criarRelato(db, { pautaId: pauta.id, moderacao: 'aprovado' });
    await criarRelato(db, { pautaId: pauta.id, moderacao: 'recusado' });
    await criarRelato(db, { pautaId: recusada.id });

    const fila = await listarRelatosPendentes(db);

    expect(fila.find((p) => p.id === pauta.id)?.relatos.map((r) => r.id)).toEqual([pendente.id]);
    expect(fila.map((p) => p.id)).not.toContain(recusada.id);
  });

  it('pauta sem relato pendente não entra na fila', async () => {
    const pauta = await criarPauta(db);
    await criarRelato(db, { pautaId: pauta.id, moderacao: 'aprovado' });

    expect((await listarRelatosPendentes(db)).map((p) => p.id)).not.toContain(pauta.id);
  });

  it('aponta no texto o que a curadoria precisa barrar', async () => {
    const pauta = await criarPauta(db);
    await criarRelato(db, {
      pautaId: pauta.id,
      texto: 'A professora Marta sabe, falem comigo: fulano@ufal.br',
    });

    const fila = await listarRelatosPendentes(db);

    expect(fila.find((p) => p.id === pauta.id)?.relatos[0]?.achados).toMatchObject([
      { severidade: 'aviso', motivo: 'possivel_nome', trecho: 'professora Marta' },
      { severidade: 'bloqueio', motivo: 'email', trecho: 'fulano@ufal.br' },
    ]);
  });
});

describe('aprovarRelato', () => {
  it('marca como aprovado, com a hora, e registra relato_aprovado público', async () => {
    const pauta = await criarPauta(db);
    const relato = await criarRelato(db, { pautaId: pauta.id });
    const agora = new Date('2030-01-02T12:00:00.000Z');

    const r = await db.transaction((tx) =>
      aprovarRelato(tx, { relatoId: relato.id, curadorId, agora }),
    );

    expect(r).toEqual({ moderado: true });
    expect(await relatoDo(relato.id)).toMatchObject({
      moderacao: 'aprovado',
      moderadoEm: agora,
      moderadoPor: curadorId,
    });
    expect(await eventosDa(pauta.id)).toEqual([
      {
        tipo: 'relato_aprovado',
        dados: { relato_id: relato.id },
        origem: 'curadoria',
        publico: true,
      },
    ]);
  });

  it('relato já moderado não muda nem ganha evento', async () => {
    const pauta = await criarPauta(db);
    const relato = await criarRelato(db, { pautaId: pauta.id });
    const antes = new Date('2030-01-02T12:00:00.000Z');
    await db.transaction((tx) =>
      recusarRelato(tx, { relatoId: relato.id, curadorId, agora: antes }),
    );

    const r = await db.transaction((tx) => aprovarRelato(tx, { relatoId: relato.id, curadorId }));

    expect(r).toEqual({ moderado: false, motivo: 'ja_moderado' });
    expect(await relatoDo(relato.id)).toMatchObject({ moderacao: 'recusado', moderadoEm: antes });
    expect(await eventosDa(pauta.id)).toEqual([]);
  });

  it('relato que não existe', async () => {
    const r = await db.transaction((tx) =>
      aprovarRelato(tx, { relatoId: '00000000-0000-0000-0000-000000000000', curadorId }),
    );
    expect(r).toEqual({ moderado: false, motivo: 'relato_inexistente' });
  });
});

describe('recusarRelato', () => {
  it('marca como recusado, com a hora, e não registra evento', async () => {
    const pauta = await criarPauta(db);
    const relato = await criarRelato(db, { pautaId: pauta.id });
    const agora = new Date('2030-01-02T12:00:00.000Z');

    const r = await db.transaction((tx) =>
      recusarRelato(tx, { relatoId: relato.id, curadorId, agora }),
    );

    expect(r).toEqual({ moderado: true });
    expect(await relatoDo(relato.id)).toMatchObject({
      moderacao: 'recusado',
      moderadoEm: agora,
      moderadoPor: curadorId,
    });
    expect(await eventosDa(pauta.id)).toEqual([]);
  });

  it('relato já aprovado continua aprovado', async () => {
    const pauta = await criarPauta(db);
    const relato = await criarRelato(db, { pautaId: pauta.id });
    const antes = new Date('2030-01-02T12:00:00.000Z');
    await db.transaction((tx) =>
      aprovarRelato(tx, { relatoId: relato.id, curadorId, agora: antes }),
    );

    const r = await db.transaction((tx) => recusarRelato(tx, { relatoId: relato.id, curadorId }));

    expect(r).toEqual({ moderado: false, motivo: 'ja_moderado' });
    expect(await relatoDo(relato.id)).toMatchObject({ moderacao: 'aprovado', moderadoEm: antes });
    expect(await eventosDa(pauta.id)).toHaveLength(1);
  });

  it('relato que não existe', async () => {
    const r = await db.transaction((tx) =>
      recusarRelato(tx, { relatoId: '00000000-0000-0000-0000-000000000000', curadorId }),
    );
    expect(r).toEqual({ moderado: false, motivo: 'relato_inexistente' });
  });
});

// SCRUM-173. O filtro das views é testado com o seed em `packages/db/src/views-publicas.test.ts`;
// aqui o caminho é o da curadoria: a decisão tomada pela regra é o que o site passa a ver.
describe('moderação e views públicas', () => {
  async function noSite<T>(consulta: ReturnType<typeof sql>): Promise<T[]> {
    const resultado: unknown = await db.execute(consulta);
    return (resultado as { rows: T[] }).rows;
  }

  it('só o relato aprovado aparece no site; pendente e recusado ficam de fora', async () => {
    const pauta = await criarPauta(db);
    const [aprovado, recusado] = [
      await criarRelato(db, { pautaId: pauta.id, texto: 'aprovado', fotoChave: 'fotos/a.jpg' }),
      await criarRelato(db, { pautaId: pauta.id, texto: 'recusado', fotoChave: 'fotos/r.jpg' }),
    ];
    await criarRelato(db, { pautaId: pauta.id, texto: 'pendente', fotoChave: 'fotos/p.jpg' });
    const relatosNoSite = () =>
      noSite(sql`SELECT texto, foto_chave FROM v_relato_publico WHERE pauta_slug = ${pauta.slug}`);

    // Antes de qualquer decisão, os três estão pendentes.
    expect(await relatosNoSite()).toEqual([]);

    await db.transaction((tx) => aprovarRelato(tx, { relatoId: aprovado.id, curadorId }));
    await db.transaction((tx) => recusarRelato(tx, { relatoId: recusado.id, curadorId }));

    expect(await relatosNoSite()).toEqual([{ texto: 'aprovado', foto_chave: 'fotos/a.jpg' }]);
    // Na atividade e na linha do tempo, só a aprovação, e sem o id nem o texto do relato.
    for (const view of ['v_atividade', 'v_linha_do_tempo']) {
      expect(
        await noSite(
          sql`SELECT tipo, dados FROM ${sql.identifier(view)} WHERE pauta_slug = ${pauta.slug}`,
        ),
        view,
      ).toEqual([{ tipo: 'relato_aprovado', dados: {} }]);
    }
  });
});

// Concorrência precisa de duas conexões ao mesmo tempo, o que o PGlite não tem.
const URL_TESTE = process.env.DATABASE_URL_TESTE;
if (!URL_TESTE && process.env.CI) throw new Error('No CI, defina DATABASE_URL_TESTE.');

describe.skipIf(!URL_TESTE)('moderação com Postgres de verdade', () => {
  it('duas decisões simultâneas sobre o mesmo relato: só uma vale', async () => {
    const temporario = await criarBancoTemporario(URL_TESTE ?? '');
    // Com tratador de erro: apagar o banco temporário derruba as conexões (57P01), e uma conexão
    // sem tratador derruba a suíte.
    const pool = criarPool(
      temporario.url,
      { conexaoMs: 5000, consultaMs: 15_000 },
      () => undefined,
    );
    const real = criarDb(pool);
    try {
      const pauta = await criarPauta(real);
      const curador = await criarCurador(real);

      // Várias rodadas: sem o FOR UPDATE a corrida não aparece em toda tentativa.
      for (let rodada = 0; rodada < 10; rodada++) {
        const relato = await criarRelato(real, { pautaId: pauta.id });
        const decisao = { relatoId: relato.id, curadorId: curador.id };

        const resultados = await Promise.all([
          real.transaction((tx) => aprovarRelato(tx, decisao)),
          real.transaction((tx) => recusarRelato(tx, decisao)),
        ]);

        expect(resultados.filter((r) => r.moderado)).toHaveLength(1);
        expect(resultados).toContainEqual({ moderado: false, motivo: 'ja_moderado' });
        // O evento acompanha a decisão que valeu: aprovação que perdeu a corrida não deixa rastro.
        const aprovou = resultados[0].moderado;
        expect((await relatoDo(relato.id, real))?.moderacao).toBe(
          aprovou ? 'aprovado' : 'recusado',
        );
        const doRelato = (await eventosDa(pauta.id, real)).filter(
          (e) => (e.dados as { relato_id?: string }).relato_id === relato.id,
        );
        expect(doRelato).toHaveLength(aprovou ? 1 : 0);
      }
    } finally {
      await pool.end();
      await temporario.apagar();
    }
  }, 30_000);
});
