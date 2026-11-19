import {
  criarDb,
  criarPool,
  disparos,
  eq,
  eventos,
  pautas,
  relatoFotos,
  relatos,
  sql,
  type Db,
} from '@lumens/db';
import { criarBancoEmMemoria, criarBancoTemporario } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { sairDoLumens } from '../estudante/sair';
import {
  criarBloco,
  criarCurador,
  criarEstudanteVerificado,
  criarPauta,
  criarRelato,
} from '../teste/fabricas';
import { aprovarRelato, listarRelatosPendentes, recusarFoto, recusarRelato } from './moderacao';

let db: Db;
let curadorId: string;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
  curadorId = (await criarCurador(db)).id;
});

const relatoDo = async (id: string, banco: Db = db) =>
  (await banco.select().from(relatos).where(eq(relatos.id, id)))[0];

const fotosDo = (relatoId: string, banco: Db = db) =>
  banco
    .select()
    .from(relatoFotos)
    .where(eq(relatoFotos.relatoId, relatoId))
    .orderBy(relatoFotos.ordem);

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
      status: 'juntando_apoios',
      criadaEm: new Date('2030-01-01T10:00:00.000Z'),
    });
    const daNova = await criarRelato(db, {
      pautaId: nova.id,
      texto: 'Sem água há dias.',
      fotoChaves: ['fotos/bebedouro.jpg'],
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
          .map((r) => ({ id: r.id, texto: r.texto, fotos: [], achados: [] }))
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
            fotos: [{ id: expect.any(String) as string, chave: 'fotos/bebedouro.jpg' }],
            achados: [],
          },
        ],
      },
    ]);
  });

  it('deixa de fora relato já moderado e relato de pauta recusada', async () => {
    const pauta = await criarPauta(db);
    const emCuradoria = await criarPauta(db, { status: 'em_curadoria' });
    const recusada = await criarPauta(db, { status: 'recusada' });
    const pendente = await criarRelato(db, { pautaId: pauta.id });
    await criarRelato(db, { pautaId: emCuradoria.id });
    await criarRelato(db, { pautaId: pauta.id, moderacao: 'aprovado' });
    await criarRelato(db, { pautaId: pauta.id, moderacao: 'recusado' });
    await criarRelato(db, { pautaId: recusada.id });

    const fila = await listarRelatosPendentes(db);

    expect(fila.find((p) => p.id === pauta.id)?.relatos.map((r) => r.id)).toEqual([pendente.id]);
    expect(fila.map((p) => p.id)).not.toContain(recusada.id);
    expect(fila.map((p) => p.id)).not.toContain(emCuradoria.id);
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
      aprovarRelato(tx, { relatoId: relato.id, curadorId, agora, fotosVistas: [] }),
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

    const r = await db.transaction((tx) =>
      aprovarRelato(tx, { relatoId: relato.id, curadorId, fotosVistas: [] }),
    );

    expect(r).toEqual({ moderado: false, motivo: 'ja_moderado' });
    expect(await relatoDo(relato.id)).toMatchObject({ moderacao: 'recusado', moderadoEm: antes });
    expect(await eventosDa(pauta.id)).toEqual([]);
  });

  it('foto juntada depois de a fila abrir: aprovar o relato visto sem foto é recusado', async () => {
    const pauta = await criarPauta(db);
    const relato = await criarRelato(db, { pautaId: pauta.id });
    const [foto] = await db
      .insert(relatoFotos)
      .values({ relatoId: relato.id, chave: 'fotos/nova.jpg', ordem: 1 })
      .returning();

    const r = await db.transaction((tx) =>
      aprovarRelato(tx, { relatoId: relato.id, curadorId, fotosVistas: [] }),
    );

    expect(r).toEqual({ moderado: false, motivo: 'relato_mudou' });
    expect(await relatoDo(relato.id)).toMatchObject({ moderacao: 'pendente', moderadoEm: null });
    expect(await eventosDa(pauta.id)).toEqual([]);

    // Vista a foto nova, a aprovação passa e a foto vai junto.
    const outra = await db.transaction((tx) =>
      aprovarRelato(tx, { relatoId: relato.id, curadorId, fotosVistas: [foto?.id ?? ''] }),
    );
    expect(outra).toEqual({ moderado: true });
    expect(await fotosDo(relato.id)).toMatchObject([
      { chave: 'fotos/nova.jpg', moderacao: 'aprovado' },
    ]);
  });

  it('foto recusada depois de a tela abrir também faz a aprovação voltar', async () => {
    const pauta = await criarPauta(db);
    const relato = await criarRelato(db, {
      pautaId: pauta.id,
      fotoChaves: ['fotos/a1.jpg', 'fotos/a2.jpg'],
    });
    const [primeira, segunda] = await fotosDo(relato.id);
    await db.transaction((tx) =>
      recusarFoto(tx, { fotoId: primeira?.id ?? '', curadorId, motivo: 'Aparece um rosto.' }),
    );

    const velha = await db.transaction((tx) =>
      aprovarRelato(tx, {
        relatoId: relato.id,
        curadorId,
        fotosVistas: [primeira?.id ?? '', segunda?.id ?? ''],
      }),
    );
    expect(velha).toEqual({ moderado: false, motivo: 'relato_mudou' });

    const atual = await db.transaction((tx) =>
      aprovarRelato(tx, { relatoId: relato.id, curadorId, fotosVistas: [segunda?.id ?? ''] }),
    );
    expect(atual).toEqual({ moderado: true });
    expect(await fotosDo(relato.id)).toMatchObject([
      { chave: 'fotos/a1.jpg', moderacao: 'recusado' },
      { chave: 'fotos/a2.jpg', moderacao: 'aprovado' },
    ]);
  });

  it('relato que não existe', async () => {
    const r = await db.transaction((tx) =>
      aprovarRelato(tx, {
        relatoId: '00000000-0000-0000-0000-000000000000',
        curadorId,
        fotosVistas: [],
      }),
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
      aprovarRelato(tx, { relatoId: relato.id, curadorId, agora: antes, fotosVistas: [] }),
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

describe('recusarFoto', () => {
  const recusar = (fotoId: string, motivo: string, agora?: Date) =>
    db.transaction((tx) =>
      recusarFoto(tx, { fotoId, curadorId, motivo, ...(agora === undefined ? {} : { agora }) }),
    );

  it('recusa só a foto, com motivo, e o texto e as outras seguem', async () => {
    const pauta = await criarPauta(db);
    const relato = await criarRelato(db, {
      pautaId: pauta.id,
      fotoChaves: ['fotos/b1.jpg', 'fotos/b2.jpg', 'fotos/b3.jpg'],
    });
    const [, meio] = await fotosDo(relato.id);
    const agora = new Date('2030-01-02T12:00:00.000Z');

    expect(await recusar(meio?.id ?? '', '  Aparece o rosto de uma pessoa.  ', agora)).toEqual({
      recusada: true,
    });

    expect(await fotosDo(relato.id)).toMatchObject([
      { moderacao: 'pendente' },
      {
        moderacao: 'recusado',
        motivoRecusa: 'Aparece o rosto de uma pessoa.',
        moderadoEm: agora,
        moderadoPor: curadorId,
      },
      { moderacao: 'pendente' },
    ]);
    expect(await relatoDo(relato.id)).toMatchObject({ moderacao: 'pendente' });
  });

  it('o motivo é obrigatório, de uma linha e com tamanho limitado', async () => {
    const pauta = await criarPauta(db);
    const relato = await criarRelato(db, { pautaId: pauta.id, fotoChaves: ['fotos/c1.jpg'] });
    const [foto] = await fotosDo(relato.id);

    for (const motivo of [
      '',
      '   ',
      'duas' + String.fromCharCode(10) + 'linhas',
      'x'.repeat(201),
    ]) {
      expect(await recusar(foto?.id ?? '', motivo)).toEqual({
        recusada: false,
        motivo: 'motivo_invalido',
      });
    }
    expect((await fotosDo(relato.id))[0]?.moderacao).toBe('pendente');
  });

  it('foto já recusada, que não existe ou de relato recusado não muda', async () => {
    const pauta = await criarPauta(db);
    const relato = await criarRelato(db, { pautaId: pauta.id, fotoChaves: ['fotos/d1.jpg'] });
    const [foto] = await fotosDo(relato.id);
    await recusar(foto?.id ?? '', 'Fora de foco.');
    expect(await recusar(foto?.id ?? '', 'Outra vez.')).toEqual({
      recusada: false,
      motivo: 'ja_recusada',
    });
    expect((await fotosDo(relato.id))[0]?.motivoRecusa).toBe('Fora de foco.');
    expect(await recusar('00000000-0000-0000-0000-000000000000', 'x')).toEqual({
      recusada: false,
      motivo: 'foto_inexistente',
    });

    const outro = await criarRelato(db, { pautaId: pauta.id, fotoChaves: ['fotos/d2.jpg'] });
    await db.transaction((tx) => recusarRelato(tx, { relatoId: outro.id, curadorId }));
    const [daqueleRelato] = await fotosDo(outro.id);
    expect(await recusar(daqueleRelato?.id ?? '', 'x')).toEqual({
      recusada: false,
      motivo: 'relato_recusado',
    });
  });

  it('tira do site a foto de um relato já publicado, sem tirar o texto', async () => {
    const pauta = await criarPauta(db);
    const relato = await criarRelato(db, {
      pautaId: pauta.id,
      fotoChaves: ['fotos/e1.jpg', 'fotos/e2.jpg'],
    });
    const fotos = await fotosDo(relato.id);
    await db.transaction((tx) =>
      aprovarRelato(tx, { relatoId: relato.id, curadorId, fotosVistas: fotos.map((f) => f.id) }),
    );
    const noSite = async () => {
      const r: unknown = await db.execute(
        sql`SELECT texto, fotos FROM v_relato_publico WHERE pauta_slug = ${pauta.slug}`,
      );
      return (r as { rows: unknown[] }).rows;
    };
    expect(await noSite()).toEqual([
      { texto: 'Relato de teste.', fotos: ['fotos/e1.jpg', 'fotos/e2.jpg'] },
    ]);

    await recusar(fotos[0]?.id ?? '', 'Mostra uma matrícula.');

    expect(await noSite()).toEqual([{ texto: 'Relato de teste.', fotos: ['fotos/e2.jpg'] }]);
    // A rota de foto do site só enxerga a chave da foto aprovada.
    const chavesPublicas = async () => {
      const r: unknown = await db.execute(
        sql`SELECT chave FROM v_foto_publica WHERE chave IN ('fotos/e1.jpg', 'fotos/e2.jpg')`,
      );
      return (r as { rows: { chave: string }[] }).rows.map((l) => l.chave);
    };
    expect(await chavesPublicas()).toEqual(['fotos/e2.jpg']);
    await db.update(pautas).set({ status: 'em_curadoria' }).where(eq(pautas.id, pauta.id));
    expect(await chavesPublicas()).toEqual([]);
  });

  it('avisa só quem enviou, com o motivo e sem nome de curador, na mesma transação', async () => {
    const pauta = await criarPauta(db, { titulo: 'Bebedouro do bloco 12' });
    const relato = await criarRelato(db, { pautaId: pauta.id, fotoChaves: ['fotos/f1.jpg'] });
    const [foto] = await fotosDo(relato.id);

    await recusar(foto?.id ?? '', 'Aparece um rosto.');

    const avisos = await db
      .select()
      .from(disparos)
      .where(eq(disparos.aviso, foto?.id ?? ''));
    expect(avisos).toMatchObject([
      {
        tipo: 'foto_recusada',
        estudanteId: relato.estudanteId,
        modelo: 'lumens_foto_recusada',
        parametros: ['Bebedouro do bloco 12', 'Aparece um rosto.'],
      },
    ]);

    // Se a transação volta, a foto continua pendente e nada é avisado.
    const outro = await criarRelato(db, { pautaId: pauta.id, fotoChaves: ['fotos/f2.jpg'] });
    const [fotoDoOutro] = await fotosDo(outro.id);
    await expect(
      db.transaction(async (tx) => {
        await recusarFoto(tx, { fotoId: fotoDoOutro?.id ?? '', curadorId, motivo: 'x' });
        throw new Error('volta');
      }),
    ).rejects.toThrow('volta');
    expect((await fotosDo(outro.id))[0]?.moderacao).toBe('pendente');
    expect(
      await db
        .select()
        .from(disparos)
        .where(eq(disparos.aviso, fotoDoOutro?.id ?? '')),
    ).toEqual([]);
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
      await criarRelato(db, { pautaId: pauta.id, texto: 'aprovado', fotoChaves: ['fotos/a.jpg'] }),
      await criarRelato(db, { pautaId: pauta.id, texto: 'recusado', fotoChaves: ['fotos/r.jpg'] }),
    ];
    await criarRelato(db, { pautaId: pauta.id, texto: 'pendente', fotoChaves: ['fotos/p.jpg'] });
    const relatosNoSite = () =>
      noSite(sql`SELECT texto, fotos FROM v_relato_publico WHERE pauta_slug = ${pauta.slug}`);

    // Antes de qualquer decisão, os três estão pendentes.
    expect(await relatosNoSite()).toEqual([]);

    const fotoAprovada = (await fotosDo(aprovado.id))[0]?.id ?? '';
    await db.transaction((tx) =>
      aprovarRelato(tx, { relatoId: aprovado.id, curadorId, fotosVistas: [fotoAprovada] }),
    );
    await db.transaction((tx) => recusarRelato(tx, { relatoId: recusado.id, curadorId }));

    expect(await relatosNoSite()).toEqual([{ texto: 'aprovado', fotos: ['fotos/a.jpg'] }]);
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
  it('sair e moderar o relato com foto ao mesmo tempo: nenhuma das duas cai em deadlock', async () => {
    const temporario = await criarBancoTemporario(URL_TESTE ?? '');
    const pool = criarPool(
      temporario.url,
      { conexaoMs: 5000, consultaMs: 15_000 },
      () => undefined,
    );
    const real = criarDb(pool);
    try {
      const pauta = await criarPauta(real);
      const curador = await criarCurador(real);
      for (let rodada = 0; rodada < 15; rodada++) {
        const estudante = await criarEstudanteVerificado(real);
        const relato = await criarRelato(real, {
          pautaId: pauta.id,
          estudanteId: estudante.id,
          fotoChaves: [`fotos/2026/11/sair-${String(rodada)}.jpg`],
        });
        const [foto] = await fotosDo(relato.id, real);

        const resultados = await Promise.allSettled([
          real.transaction((tx) =>
            aprovarRelato(tx, {
              relatoId: relato.id,
              curadorId: curador.id,
              fotosVistas: [foto?.id ?? ''],
            }),
          ),
          real.transaction((tx) => sairDoLumens(tx, { estudanteId: estudante.id })),
        ]);

        // Sem a ordem de travas igual (relato antes da foto), uma das duas aborta com 40P01.
        expect(resultados.filter((r) => r.status === 'rejected')).toEqual([]);
      }
    } finally {
      await pool.end();
      await temporario.apagar();
    }
  }, 60_000);

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
          real.transaction((tx) => aprovarRelato(tx, { ...decisao, fotosVistas: [] })),
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
