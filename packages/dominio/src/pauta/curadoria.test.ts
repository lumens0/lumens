import {
  apoios,
  disparos,
  eq,
  estudantes,
  eventos,
  papeisPauta,
  pautas,
  relatos,
  type Db,
} from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  aprovarPauta,
  buscarPautaDaCuradoria,
  listarFilaDeCuradoria,
  listarPautasDaCuradoria,
  recusarPauta,
} from './curadoria';
import { reservarLote } from '../avisos/fila';
import { registrarPromessa } from '../caminhos/promessa';
import { abrirConferencia } from '../conferencia/conferencia-agenda';
import {
  criarBloco,
  criarCurador,
  criarEstudanteVerificado,
  criarPauta,
  tornarOwner,
} from '../teste/fabricas';
import { transicionarStatus } from './status';

let db: Db;
let curadorId: string;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
  curadorId = (await criarCurador(db)).id;
});

const novaEmCuradoria = (criadaEm = new Date()) =>
  criarPauta(db, { status: 'em_curadoria', criadaEm });

const pautaDa = async (id: string) => (await db.select().from(pautas).where(eq(pautas.id, id)))[0];

const eventosDa = (id: string) =>
  db
    .select({ tipo: eventos.tipo, origem: eventos.origem, publico: eventos.publico })
    .from(eventos)
    .where(eq(eventos.pautaId, id));

describe('listarFilaDeCuradoria', () => {
  it('traz só pautas em curadoria, da mais antiga para a mais nova, com o prazo de 24 h', async () => {
    const agora = new Date('2030-01-02T12:00:00.000Z');
    const bloco = await criarBloco(db);
    const nova = await criarPauta(db, {
      status: 'em_curadoria',
      blocoId: bloco.id,
      criadaEm: new Date('2030-01-02T10:00:00.000Z'),
    });
    const atrasada = await novaEmCuradoria(new Date('2030-01-01T06:00:00.000Z'));
    const aprovada = await criarPauta(db, { criadaEm: new Date('2030-01-01T00:00:00.000Z') });

    const fila = await listarFilaDeCuradoria(db, agora);
    const ids = fila.map((p) => p.id);

    expect(ids).not.toContain(aprovada.id);
    expect(ids.indexOf(atrasada.id)).toBeLessThan(ids.indexOf(nova.id));
    expect(fila.find((p) => p.id === nova.id)).toMatchObject({
      bloco: bloco.nome,
      prazo: new Date('2030-01-03T10:00:00.000Z'),
      restanteMs: 22 * 3_600_000,
    });
    expect(fila.find((p) => p.id === atrasada.id)).toMatchObject({
      bloco: null,
      // Prazo venceu às 06h do dia 2; ao meio-dia, seis horas de atraso.
      restanteMs: -6 * 3_600_000,
    });
  });

  it('mostra a foto do relato de quem criou a pauta, não a de relatos que chegaram depois', async () => {
    const pauta = await novaEmCuradoria();
    const [owner, outro] = [await criarEstudanteVerificado(db), await criarEstudanteVerificado(db)];
    await db
      .insert(papeisPauta)
      .values({ pautaId: pauta.id, estudanteId: owner.id, papel: 'owner' });
    await db.insert(relatos).values([
      { pautaId: pauta.id, estudanteId: outro.id, texto: 'depois', fotoChave: 'fotos/outro.jpg' },
      { pautaId: pauta.id, estudanteId: owner.id, texto: 'sem foto' },
      { pautaId: pauta.id, estudanteId: owner.id, texto: 'origem', fotoChave: 'fotos/origem.jpg' },
      { pautaId: pauta.id, estudanteId: outro.id, texto: 'depois', fotoChave: 'fotos/outro2.jpg' },
    ]);

    const fila = await listarFilaDeCuradoria(db);

    expect(fila.find((p) => p.id === pauta.id)?.fotoChave).toBe('fotos/origem.jpg');
  });

  it('sem foto no relato de origem, a fila mostra sem foto', async () => {
    const pauta = await novaEmCuradoria();
    const [owner, outro] = [await criarEstudanteVerificado(db), await criarEstudanteVerificado(db)];
    await db
      .insert(papeisPauta)
      .values({ pautaId: pauta.id, estudanteId: owner.id, papel: 'owner' });
    await db.insert(relatos).values([
      { pautaId: pauta.id, estudanteId: owner.id, texto: 'origem' },
      { pautaId: pauta.id, estudanteId: outro.id, texto: 'depois', fotoChave: 'fotos/outro.jpg' },
    ]);

    const fila = await listarFilaDeCuradoria(db);

    expect(fila.find((p) => p.id === pauta.id)?.fotoChave).toBeNull();
  });
});

describe('buscarPautaDaCuradoria', () => {
  it('traz a pauta em qualquer status, com o motivo quando foi recusada', async () => {
    const bloco = await criarBloco(db);
    const pauta = await criarPauta(db, { status: 'em_curadoria', blocoId: bloco.id });

    expect(await buscarPautaDaCuradoria(db, pauta.id)).toMatchObject({
      id: pauta.id,
      bloco: bloco.nome,
      status: 'em_curadoria',
      motivoRecusa: null,
    });

    await db.transaction((tx) =>
      recusarPauta(tx, { pautaId: pauta.id, curadorId, motivo: 'Duplicada.' }),
    );
    expect(await buscarPautaDaCuradoria(db, pauta.id)).toMatchObject({
      status: 'recusada',
      motivoRecusa: 'Duplicada.',
    });
  });

  it('pauta que não existe', async () => {
    expect(
      await buscarPautaDaCuradoria(db, '00000000-0000-0000-0000-000000000000'),
    ).toBeUndefined();
  });

  it('a lista geral traz pautas de todos os status', async () => {
    const nova = await criarPauta(db, { status: 'em_curadoria' });
    const cobrando = await criarPauta(db, { status: 'cobrando' });

    const ids = (await listarPautasDaCuradoria(db)).map((p) => p.id);

    expect(ids).toEqual(expect.arrayContaining([nova.id, cobrando.id]));
  });
});

describe('aprovarPauta', () => {
  it('leva para juntando_apoios e registra pauta_aprovada pública', async () => {
    const pauta = await novaEmCuradoria();
    const agora = new Date('2030-01-02T12:00:00.000Z');

    const r = await db.transaction((tx) =>
      aprovarPauta(tx, { pautaId: pauta.id, curadorId, agora }),
    );

    expect(r).toEqual({ decidida: true });
    expect(await pautaDa(pauta.id)).toMatchObject({
      status: 'juntando_apoios',
      aprovadaEm: agora,
      decididaPor: curadorId,
    });
    expect(await eventosDa(pauta.id)).toEqual(
      expect.arrayContaining([
        { tipo: 'status_alterado', origem: 'curadoria', publico: true },
        { tipo: 'pauta_aprovada', origem: 'curadoria', publico: true },
      ]),
    );
  });

  it('pauta já decidida não muda nem ganha evento', async () => {
    const pauta = await novaEmCuradoria();
    await db.transaction((tx) =>
      recusarPauta(tx, { pautaId: pauta.id, curadorId, motivo: 'Duplicada.' }),
    );
    const antes = await eventosDa(pauta.id);

    const r = await db.transaction((tx) => aprovarPauta(tx, { pautaId: pauta.id, curadorId }));

    expect(r).toEqual({ decidida: false, motivo: 'ja_decidida' });
    expect((await pautaDa(pauta.id))?.status).toBe('recusada');
    expect(await eventosDa(pauta.id)).toHaveLength(antes.length);
  });

  it('avisa cada responsável ativo, com título e slug, e ninguém mais', async () => {
    const pauta = await criarPauta(db, { status: 'em_curadoria', titulo: 'Bebedouro do bloco 12' });
    const owner = await criarEstudanteVerificado(db);
    const coOwner = await criarEstudanteVerificado(db);
    const saiuDoSistema = await criarEstudanteVerificado(db);
    const saiuDoPapel = await criarEstudanteVerificado(db);
    const apoiador = await criarEstudanteVerificado(db);
    await db
      .update(estudantes)
      .set({ saiuEm: new Date() })
      .where(eq(estudantes.id, saiuDoSistema.id));
    await db.insert(papeisPauta).values([
      { pautaId: pauta.id, estudanteId: owner.id, papel: 'owner' },
      { pautaId: pauta.id, estudanteId: coOwner.id, papel: 'co_owner' },
      { pautaId: pauta.id, estudanteId: saiuDoSistema.id, papel: 'co_owner' },
      { pautaId: pauta.id, estudanteId: saiuDoPapel.id, papel: 'co_owner', ate: new Date() },
    ]);

    await db.transaction((tx) => aprovarPauta(tx, { pautaId: pauta.id, curadorId }));

    const fila = await filaDa(pauta.id);
    expect(fila.map((d) => d.estudanteId).sort()).toEqual([owner.id, coOwner.id].sort());
    expect(fila).not.toContainEqual(expect.objectContaining({ estudanteId: apoiador.id }));
    for (const d of fila) {
      expect(d).toMatchObject({
        tipo: 'aprovacao',
        modelo: 'lumens_pauta_aprovada',
        parametros: ['Bebedouro do bloco 12', pauta.slug],
      });
    }
  });

  it('na Evolution, o aviso de quem não escreveu nas últimas 24 h espera na fila até ele escrever', async () => {
    const agora = new Date('2026-11-16T12:00:00Z');
    const pauta = await criarPauta(db, { status: 'em_curadoria' });
    const recente = await criarEstudanteVerificado(db);
    const ausente = await criarEstudanteVerificado(db);
    await db.insert(papeisPauta).values([
      { pautaId: pauta.id, estudanteId: recente.id, papel: 'owner' },
      { pautaId: pauta.id, estudanteId: ausente.id, papel: 'co_owner' },
    ]);
    await db
      .update(estudantes)
      .set({ ultimaMensagemEm: new Date(agora.getTime() - 60 * 60_000) })
      .where(eq(estudantes.id, recente.id));
    await db.transaction((tx) => aprovarPauta(tx, { pautaId: pauta.id, curadorId, agora }));
    const desde = new Date(agora.getTime() - 24 * 60 * 60_000);

    const lote = await db.transaction((tx) =>
      reservarLote(tx, { limite: 10, agora, somenteQuemEscreveuDesde: desde }),
    );
    expect(lote.map((d) => d.estudanteId)).toEqual([recente.id]);

    // O aviso de quem estava ausente continua pendente; quando ele escreve, sai no lote seguinte.
    const depois = new Date(agora.getTime() + 60_000);
    await db
      .update(estudantes)
      .set({ ultimaMensagemEm: depois })
      .where(eq(estudantes.id, ausente.id));
    const seguinte = await db.transaction((tx) =>
      reservarLote(tx, { limite: 10, agora: depois, somenteQuemEscreveuDesde: desde }),
    );
    expect(seguinte.map((d) => d.estudanteId)).toEqual([ausente.id]);
  });

  it('pauta que não está em curadoria não avisa ninguém', async () => {
    const pauta = await criarPauta(db, { status: 'juntando_apoios' });
    const owner = await criarEstudanteVerificado(db);
    await db
      .insert(papeisPauta)
      .values({ pautaId: pauta.id, estudanteId: owner.id, papel: 'owner' });

    const r = await db.transaction((tx) => aprovarPauta(tx, { pautaId: pauta.id, curadorId }));

    expect(r).toEqual({ decidida: false, motivo: 'ja_decidida' });
    expect(await filaDa(pauta.id)).toEqual([]);
  });

  it('pauta que não existe', async () => {
    const r = await db.transaction((tx) =>
      aprovarPauta(tx, { pautaId: '00000000-0000-0000-0000-000000000000', curadorId }),
    );
    expect(r).toEqual({ decidida: false, motivo: 'pauta_inexistente' });
  });
});

describe('quem cria a pauta conta como apoio (SCRUM-344)', () => {
  const apoiosDa = (pautaId: string) =>
    db.select({ estudanteId: apoios.estudanteId }).from(apoios).where(eq(apoios.pautaId, pautaId));

  /** Pauta em curadoria com quem a criou como owner, como o `criarPauta` do bot deixa. */
  async function criadaPor() {
    const pauta = await novaEmCuradoria();
    const autor = await criarEstudanteVerificado(db);
    await tornarOwner(db, pauta.id, autor.id);
    return { pauta, autor };
  }

  it('pauta recém-aprovada mostra 1 apoio, o de quem criou', async () => {
    const { pauta, autor } = await criadaPor();

    await db.transaction((tx) => aprovarPauta(tx, { pautaId: pauta.id, curadorId }));

    expect(await apoiosDa(pauta.id)).toEqual([{ estudanteId: autor.id }]);
  });

  it('quem saiu do Lumens antes da aprovação não vira apoio, e a aprovação segue', async () => {
    const { pauta, autor } = await criadaPor();
    await db.update(estudantes).set({ saiuEm: new Date() }).where(eq(estudantes.id, autor.id));

    const r = await db.transaction((tx) => aprovarPauta(tx, { pautaId: pauta.id, curadorId }));

    expect(r).toEqual({ decidida: true });
    expect(await apoiosDa(pauta.id)).toEqual([]);
  });

  it('recusar não registra apoio', async () => {
    const { pauta } = await criadaPor();

    await db.transaction((tx) =>
      recusarPauta(tx, { pautaId: pauta.id, curadorId, motivo: 'Duplicada.' }),
    );

    expect(await apoiosDa(pauta.id)).toEqual([]);
  });

  it('o owner recebe o aviso da promessa e o "Foi feito?" sem ter apoiado à parte', async () => {
    const { pauta, autor } = await criadaPor();
    await db.transaction((tx) => aprovarPauta(tx, { pautaId: pauta.id, curadorId }));
    // Protocolo cedo no Fala.BR: a pauta vai a `cobrando` sem nenhum outro apoio (RN05).
    await db.transaction((tx) =>
      transicionarStatus(tx, { pautaId: pauta.id, para: 'cobrando', origem: 'bot' }),
    );

    const { promessaId, avisados } = await db.transaction((tx) =>
      registrarPromessa(tx, {
        pautaId: pauta.id,
        resumo: 'instalar 20 mesas',
        dataEntrega: '2030-03-01',
        fonte: 'ofício 1/2030',
        registradaPor: curadorId,
      }),
    );
    await db.transaction((tx) =>
      abrirConferencia(tx, { promessaId, agora: new Date('2030-03-01T12:00:00Z') }),
    );

    expect(avisados).toBe(1);
    const avisos = await db
      .select({ tipo: disparos.tipo, estudanteId: disparos.estudanteId })
      .from(disparos)
      .where(eq(disparos.aviso, promessaId));
    expect(avisos).toEqual(
      expect.arrayContaining([
        { tipo: 'resposta_oficial', estudanteId: autor.id },
        { tipo: 'conferencia', estudanteId: autor.id },
      ]),
    );
  });
});

const filaDa = (pautaId: string) =>
  db
    .select({
      tipo: disparos.tipo,
      estudanteId: disparos.estudanteId,
      modelo: disparos.modelo,
      parametros: disparos.parametros,
    })
    .from(disparos)
    .where(eq(disparos.aviso, pautaId));

describe('recusarPauta', () => {
  it('manda o motivo para quem criou a pauta pela fila, em uma linha só', async () => {
    const pauta = await criarPauta(db, { status: 'em_curadoria', titulo: 'Bebedouro do bloco 12' });
    const owner = await criarEstudanteVerificado(db);
    await db
      .insert(papeisPauta)
      .values({ pautaId: pauta.id, estudanteId: owner.id, papel: 'owner' });

    await db.transaction((tx) =>
      recusarPauta(tx, {
        pautaId: pauta.id,
        curadorId,
        motivo: 'Já existe\n  a pauta do bebedouro.',
      }),
    );

    expect(await filaDa(pauta.id)).toEqual([
      {
        tipo: 'recusa',
        estudanteId: owner.id,
        modelo: 'lumens_pauta_recusada',
        parametros: ['Bebedouro do bloco 12', 'Já existe a pauta do bebedouro.'],
      },
    ]);
  });

  it('owner que saiu do sistema não recebe, e a recusa vale do mesmo jeito', async () => {
    const pauta = await criarPauta(db, { status: 'em_curadoria' });
    const owner = await criarEstudanteVerificado(db);
    await db.update(estudantes).set({ saiuEm: new Date() }).where(eq(estudantes.id, owner.id));
    await db
      .insert(papeisPauta)
      .values({ pautaId: pauta.id, estudanteId: owner.id, papel: 'owner' });

    const r = await db.transaction((tx) =>
      recusarPauta(tx, { pautaId: pauta.id, curadorId, motivo: 'Fora do escopo.' }),
    );

    expect(r).toEqual({ decidida: true });
    expect(await filaDa(pauta.id)).toEqual([]);
  });

  it('recusa bloqueada ou repetida não manda aviso', async () => {
    const pauta = await criarPauta(db, { status: 'em_curadoria' });
    const owner = await criarEstudanteVerificado(db);
    await db
      .insert(papeisPauta)
      .values({ pautaId: pauta.id, estudanteId: owner.id, papel: 'owner' });

    await db.transaction((tx) => recusarPauta(tx, { pautaId: pauta.id, curadorId, motivo: '  ' }));
    expect(await filaDa(pauta.id)).toEqual([]);

    await db.transaction((tx) =>
      recusarPauta(tx, { pautaId: pauta.id, curadorId, motivo: 'Duplicada.' }),
    );
    await db.transaction((tx) =>
      recusarPauta(tx, { pautaId: pauta.id, curadorId, motivo: 'De novo.' }),
    );
    expect(await filaDa(pauta.id)).toHaveLength(1);
  });

  it('grava o motivo e registra a recusa fora do site', async () => {
    const pauta = await novaEmCuradoria();

    const r = await db.transaction((tx) =>
      recusarPauta(tx, {
        pautaId: pauta.id,
        curadorId,
        motivo: '  Já existe a pauta do bebedouro.  ',
      }),
    );

    expect(r).toEqual({ decidida: true });
    expect(await pautaDa(pauta.id)).toMatchObject({
      status: 'recusada',
      motivoRecusa: 'Já existe a pauta do bebedouro.',
      decididaPor: curadorId,
    });
    expect(await eventosDa(pauta.id)).toEqual(
      expect.arrayContaining([
        { tipo: 'status_alterado', origem: 'curadoria', publico: false },
        { tipo: 'pauta_recusada', origem: 'curadoria', publico: false },
      ]),
    );
  });

  it('motivo acima de 500 caracteres é recusado pelo servidor, sem mudar nada nem avisar', async () => {
    const pauta = await novaEmCuradoria();

    const longo = await db.transaction((tx) =>
      recusarPauta(tx, { pautaId: pauta.id, curadorId, motivo: 'a'.repeat(501) }),
    );
    expect(longo).toEqual({ decidida: false, motivo: 'motivo_longo' });
    expect((await pautaDa(pauta.id))?.status).toBe('em_curadoria');
    expect(await eventosDa(pauta.id)).toHaveLength(0);
    expect(await filaDa(pauta.id)).toEqual([]);

    // O teto conta o texto sem os espaços das pontas, como o que fica gravado.
    const noLimite = await db.transaction((tx) =>
      recusarPauta(tx, { pautaId: pauta.id, curadorId, motivo: `  ${'a'.repeat(500)}  ` }),
    );
    expect(noLimite).toEqual({ decidida: true });
  });

  it('o teto conta caracteres, não unidades UTF-16: 500 emojis passam, 501 não', async () => {
    const pauta = await novaEmCuradoria();

    const longo = await db.transaction((tx) =>
      recusarPauta(tx, { pautaId: pauta.id, curadorId, motivo: '😀'.repeat(501) }),
    );
    expect(longo).toEqual({ decidida: false, motivo: 'motivo_longo' });

    const noLimite = await db.transaction((tx) =>
      recusarPauta(tx, { pautaId: pauta.id, curadorId, motivo: '😀'.repeat(500) }),
    );
    expect(noLimite).toEqual({ decidida: true });
  });

  it('motivo longo em pauta já decidida ou inexistente devolve o motivo do status', async () => {
    const pauta = await novaEmCuradoria();
    await db.transaction((tx) => aprovarPauta(tx, { pautaId: pauta.id, curadorId }));
    const longo = 'a'.repeat(501);

    const decidida = await db.transaction((tx) =>
      recusarPauta(tx, { pautaId: pauta.id, curadorId, motivo: longo }),
    );
    expect(decidida).toEqual({ decidida: false, motivo: 'ja_decidida' });

    const inexistente = await db.transaction((tx) =>
      recusarPauta(tx, {
        pautaId: '00000000-0000-4000-8000-000000000000',
        curadorId,
        motivo: longo,
      }),
    );
    expect(inexistente).toEqual({ decidida: false, motivo: 'pauta_inexistente' });
  });

  it.each(['', '   '])('recusa sem motivo (%j) é bloqueada e nada muda', async (motivo) => {
    const pauta = await novaEmCuradoria();

    const r = await db.transaction((tx) =>
      recusarPauta(tx, { pautaId: pauta.id, curadorId, motivo }),
    );

    expect(r).toEqual({ decidida: false, motivo: 'motivo_obrigatorio' });
    expect((await pautaDa(pauta.id))?.status).toBe('em_curadoria');
    expect(await eventosDa(pauta.id)).toHaveLength(0);
  });
});
