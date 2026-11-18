import {
  documentosResposta,
  disparos,
  eq,
  estudantes,
  eventos,
  caminhos,
  papeisPauta,
  pautas,
  promessas,
  relatos,
  type Db,
} from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  aprovarPauta,
  buscarPautaDaCuradoria,
  definirCategoria,
  listarFilaDeCuradoria,
  listarPautasDaCuradoria,
  recusarPauta,
  recusarRelatoDeOrigem,
  resumoDaCuradoria,
} from './curadoria';
import { reservarLote } from '../avisos/fila';
import {
  criarBloco,
  criarCurador,
  criarEstudanteVerificado,
  criarPauta,
  criarRelato,
} from '../teste/fabricas';

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

  it('na busca, % e _ são texto, não curinga', async () => {
    const comPorcento = await criarPauta(db, {
      status: 'cobrando',
      titulo: 'Desconto de 50% no RU',
    });
    await criarPauta(db, { status: 'cobrando', titulo: 'Desconto de 500 reais no RU' });

    const achadas = await listarPautasDaCuradoria(db, new Date(), { q: '50%' });
    const sublinhado = await listarPautasDaCuradoria(db, new Date(), { q: 'Desconto_de' });

    expect(achadas.map((p) => p.id)).toEqual([comPorcento.id]);
    expect(sublinhado).toEqual([]);
  });

  it('o filtro de pendência traz as mesmas pautas que o resumo conta', async () => {
    const agora = new Date('2030-01-02T12:00:00.000Z');
    const semResposta = await criarPauta(db, { status: 'cobrando', titulo: 'Sem resposta ainda' });
    const comConferencia = await criarPauta(db, { status: 'prometido' });
    const agendada = await criarPauta(db, { status: 'prometido' });
    for (const [pauta, abre] of [
      [comConferencia, '2030-01-01T12:00:00.000Z'],
      [agendada, '2030-01-10T12:00:00.000Z'],
    ] as const) {
      await db.insert(promessas).values({
        pautaId: pauta.id,
        resumo: 'Reparo.',
        dataEntrega: '2030-01-01',
        fonte: 'Ouvidoria',
        registradaPor: curadorId,
        conferenciaAbreEm: new Date(abre),
        conferenciaFechaEm: new Date(new Date(abre).getTime() + 7 * 86_400_000),
      });
    }

    const semRespostaIds = (
      await listarPautasDaCuradoria(db, agora, { pendencia: 'sem_resposta_oficial' })
    ).map((p) => p.id);
    const conferenciaIds = (
      await listarPautasDaCuradoria(db, agora, { pendencia: 'conferencia_aberta' })
    ).map((p) => p.id);

    expect(semRespostaIds).toContain(semResposta.id);
    expect(conferenciaIds).toContain(comConferencia.id);
    expect(conferenciaIds).not.toContain(agendada.id);
  });

  it('a lista geral traz pautas de todos os status', async () => {
    const nova = await criarPauta(db, {
      status: 'em_curadoria',
      titulo: 'Iluminação do bloco norte',
    });
    const cobrando = await criarPauta(db, { status: 'cobrando', titulo: 'Resposta da ouvidoria' });

    const ids = (await listarPautasDaCuradoria(db)).map((p) => p.id);
    const filtradas = await listarPautasDaCuradoria(db, new Date(), {
      status: 'em_curadoria',
      q: 'ILUMINAÇÃO',
    });

    expect(ids).toEqual(expect.arrayContaining([nova.id, cobrando.id]));
    expect(filtradas.map((p) => p.id)).toEqual([nova.id]);
    expect(filtradas[0]).toMatchObject({ apoios: 0, meta: 300 });
  });
});

describe('resumoDaCuradoria', () => {
  it('conta pautas atrasadas, relatos públicos pendentes, cobranças sem resposta e conferências abertas', async () => {
    const agora = new Date('2030-01-02T12:00:00.000Z');
    const antes = await resumoDaCuradoria(db, agora);
    const atrasada = await criarPauta(db, {
      status: 'em_curadoria',
      criadaEm: new Date('2030-01-01T10:00:00.000Z'),
    });
    await criarPauta(db, {
      status: 'em_curadoria',
      criadaEm: new Date('2030-01-02T10:00:00.000Z'),
    });
    const pautaPublica = await criarPauta(db, { status: 'juntando_apoios' });
    // Dentro do prazo de 24 h: com a data de hoje, ficaria anos antes do `agora` do teste.
    const pautaEmRevisao = await criarPauta(db, {
      status: 'em_curadoria',
      criadaEm: new Date('2030-01-02T11:00:00.000Z'),
    });
    // Em cobrança e sem resposta oficial: entra na contagem.
    await criarPauta(db, { status: 'cobrando' });
    const cobrandoRespondida = await criarPauta(db, { status: 'cobrando' });
    const comConferencia = await criarPauta(db, { status: 'prometido' });
    await criarRelato(db, { pautaId: pautaPublica.id });
    await criarRelato(db, { pautaId: pautaEmRevisao.id });
    const estudanteComResposta = await criarEstudanteVerificado(db);
    const [caminho] = await db
      .insert(caminhos)
      .values({
        pautaId: cobrandoRespondida.id,
        tipo: 'falabr',
        status: 'aberto',
        protocolo: '12345.678901/2030-01',
      })
      .returning({ id: caminhos.id });
    if (caminho === undefined) throw new Error('caminho de teste não criado');
    await db.insert(documentosResposta).values({
      pautaId: cobrandoRespondida.id,
      caminhoId: caminho.id,
      enviadoPor: estudanteComResposta.id,
      arquivoChave: 'respostas/2030/documento-resposta.pdf',
    });
    await db.insert(promessas).values({
      pautaId: comConferencia.id,
      resumo: 'Reparo concluído.',
      dataEntrega: '2030-01-10',
      fonte: 'Ouvidoria',
      registradaPor: curadorId,
      conferenciaAbreEm: new Date('2030-01-02T11:00:00.000Z'),
      conferenciaFechaEm: new Date('2030-01-03T12:00:00.000Z'),
    });

    const depois = await resumoDaCuradoria(db, agora);

    expect(depois.pautasADecidir - antes.pautasADecidir).toBe(3);
    expect(depois.pautasAtrasadas - antes.pautasAtrasadas).toBe(1);
    expect(depois.relatosAModerar - antes.relatosAModerar).toBe(1);
    expect(depois.pautasSemRespostaOficial - antes.pautasSemRespostaOficial).toBe(1);
    expect(depois.conferenciasAbertas - antes.conferenciasAbertas).toBe(1);
    expect(atrasada.status).toBe('em_curadoria');
  });
});

describe('aprovarPauta', () => {
  it('leva para juntando_apoios e registra pauta_aprovada pública', async () => {
    const pauta = await novaEmCuradoria();
    const agora = new Date('2030-01-02T12:00:00.000Z');

    const r = await db.transaction((tx) =>
      aprovarPauta(tx, {
        pautaId: pauta.id,
        curadorId,
        categoria: 'infraestrutura',
        fotoVista: null,
        agora,
      }),
    );

    expect(r).toEqual({ decidida: true });
    expect(await pautaDa(pauta.id)).toMatchObject({
      status: 'juntando_apoios',
      categoria: 'infraestrutura',
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

  it('aprova o relato pendente de quem criou a pauta, sem decidir relatos de outras pessoas', async () => {
    const pauta = await novaEmCuradoria();
    const owner = await criarEstudanteVerificado(db);
    const outraPessoa = await criarEstudanteVerificado(db);
    await db
      .insert(papeisPauta)
      .values({ pautaId: pauta.id, estudanteId: owner.id, papel: 'owner' });
    const origem = await criarRelato(db, {
      pautaId: pauta.id,
      estudanteId: owner.id,
      texto: 'Relato que criou a pauta.',
    });
    const relatoPosterior = await criarRelato(db, {
      pautaId: pauta.id,
      estudanteId: outraPessoa.id,
      texto: 'Relato de outra pessoa.',
    });
    const agora = new Date('2030-01-02T12:00:00.000Z');

    await db.transaction((tx) =>
      aprovarPauta(tx, {
        pautaId: pauta.id,
        curadorId,
        categoria: 'infraestrutura',
        fotoVista: null,
        agora,
      }),
    );

    expect(await db.select().from(relatos).where(eq(relatos.id, origem.id))).toMatchObject([
      { moderacao: 'aprovado', moderadoEm: agora, moderadoPor: curadorId },
    ]);
    expect(await db.select().from(relatos).where(eq(relatos.id, relatoPosterior.id))).toMatchObject(
      [{ moderacao: 'pendente', moderadoEm: null, moderadoPor: null }],
    );
  });

  describe('foto do relato de origem que a curadoria viu (SCRUM-301)', () => {
    async function comRelatoDeOrigem(fotoChave: string | null) {
      const pauta = await novaEmCuradoria();
      const owner = await criarEstudanteVerificado(db);
      await db
        .insert(papeisPauta)
        .values({ pautaId: pauta.id, estudanteId: owner.id, papel: 'owner' });
      const relato = await criarRelato(db, { pautaId: pauta.id, estudanteId: owner.id, fotoChave });
      return { pauta, relato };
    }
    const moderacaoDe = async (id: string) =>
      (await db.select().from(relatos).where(eq(relatos.id, id)))[0]?.moderacao;

    it('com a foto que a tela mostrou, aprova a pauta e o relato', async () => {
      const { pauta, relato } = await comRelatoDeOrigem('relatos/foto-vista.jpg');
      const r = await db.transaction((tx) =>
        aprovarPauta(tx, {
          pautaId: pauta.id,
          curadorId,
          categoria: 'infraestrutura',
          fotoVista: 'relatos/foto-vista.jpg',
        }),
      );
      expect(r).toEqual({ decidida: true });
      expect((await pautaDa(pauta.id))?.status).toBe('juntando_apoios');
      expect(await moderacaoDe(relato.id)).toBe('aprovado');
    });

    it('foto anexada depois de a tela abrir: nada muda', async () => {
      const { pauta, relato } = await comRelatoDeOrigem('relatos/foto-nova.jpg');
      const r = await db.transaction((tx) =>
        aprovarPauta(tx, {
          pautaId: pauta.id,
          curadorId,
          categoria: 'infraestrutura',
          fotoVista: null,
        }),
      );
      expect(r).toEqual({ decidida: false, motivo: 'relato_mudou' });
      expect((await pautaDa(pauta.id))?.status).toBe('em_curadoria');
      expect(await moderacaoDe(relato.id)).toBe('pendente');
      expect(await eventosDa(pauta.id)).toEqual([]);
    });

    it('sem foto e sem foto vista, aprova', async () => {
      const { pauta, relato } = await comRelatoDeOrigem(null);
      const r = await db.transaction((tx) =>
        aprovarPauta(tx, {
          pautaId: pauta.id,
          curadorId,
          categoria: 'infraestrutura',
          fotoVista: null,
        }),
      );
      expect(r).toEqual({ decidida: true });
      expect(await moderacaoDe(relato.id)).toBe('aprovado');
    });

    it('com dois relatos de origem com foto, a foto da tela é a que a aprovação confere', async () => {
      const { pauta, relato } = await comRelatoDeOrigem('relatos/a.jpg');
      await criarRelato(db, {
        pautaId: pauta.id,
        estudanteId: relato.estudanteId,
        fotoChave: 'relatos/b.jpg',
      });
      const fotoVista = (await buscarPautaDaCuradoria(db, pauta.id))?.fotoChave ?? null;
      const r = await db.transaction((tx) =>
        aprovarPauta(tx, { pautaId: pauta.id, curadorId, categoria: 'infraestrutura', fotoVista }),
      );
      expect(r).toEqual({ decidida: true });
    });

    it('relato de origem com foto recusado: a tela fica sem foto e a pauta é aprovada', async () => {
      const { pauta } = await comRelatoDeOrigem('relatos/recusada.jpg');
      await db.transaction((tx) => recusarRelatoDeOrigem(tx, { pautaId: pauta.id, curadorId }));
      const fotoVista = (await buscarPautaDaCuradoria(db, pauta.id))?.fotoChave ?? null;
      expect(fotoVista).toBeNull();
      const r = await db.transaction((tx) =>
        aprovarPauta(tx, { pautaId: pauta.id, curadorId, categoria: 'infraestrutura', fotoVista }),
      );
      expect(r).toEqual({ decidida: true });
    });
  });

  it('relato de origem com e-mail trava a aprovação; recusado só ele, a pauta sai sem o relato', async () => {
    const pauta = await novaEmCuradoria();
    const owner = await criarEstudanteVerificado(db);
    await db
      .insert(papeisPauta)
      .values({ pautaId: pauta.id, estudanteId: owner.id, papel: 'owner' });
    const origem = await criarRelato(db, {
      pautaId: pauta.id,
      estudanteId: owner.id,
      texto: 'Falem comigo: fulano@ufal.br',
    });

    const travada = await db.transaction((tx) =>
      aprovarPauta(tx, {
        pautaId: pauta.id,
        curadorId,
        categoria: 'infraestrutura',
        fotoVista: null,
      }),
    );
    expect(travada).toEqual({ decidida: false, motivo: 'relato_com_dado_pessoal' });
    expect((await pautaDa(pauta.id))?.status).toBe('em_curadoria');

    expect(
      await db.transaction((tx) => recusarRelatoDeOrigem(tx, { pautaId: pauta.id, curadorId })),
    ).toEqual({ feito: true });
    const aprovada = await db.transaction((tx) =>
      aprovarPauta(tx, {
        pautaId: pauta.id,
        curadorId,
        categoria: 'infraestrutura',
        fotoVista: null,
      }),
    );

    expect(aprovada).toEqual({ decidida: true });
    expect(await db.select().from(relatos).where(eq(relatos.id, origem.id))).toMatchObject([
      { moderacao: 'recusado', moderadoPor: curadorId },
    ]);
    expect(
      await db.transaction((tx) => recusarRelatoDeOrigem(tx, { pautaId: pauta.id, curadorId })),
    ).toEqual({ feito: false, motivo: 'ja_decidida' });
  });

  it('pauta já decidida não muda nem ganha evento', async () => {
    const pauta = await novaEmCuradoria();
    await db.transaction((tx) =>
      recusarPauta(tx, { pautaId: pauta.id, curadorId, motivo: 'Duplicada.' }),
    );
    const antes = await eventosDa(pauta.id);

    const r = await db.transaction((tx) =>
      aprovarPauta(tx, {
        pautaId: pauta.id,
        curadorId,
        categoria: 'infraestrutura',
        fotoVista: null,
      }),
    );

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

    await db.transaction((tx) =>
      aprovarPauta(tx, {
        pautaId: pauta.id,
        curadorId,
        categoria: 'infraestrutura',
        fotoVista: null,
      }),
    );

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
    await db.transaction((tx) =>
      aprovarPauta(tx, {
        pautaId: pauta.id,
        curadorId,
        categoria: 'infraestrutura',
        fotoVista: null,
        agora,
      }),
    );
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

    const r = await db.transaction((tx) =>
      aprovarPauta(tx, {
        pautaId: pauta.id,
        curadorId,
        categoria: 'infraestrutura',
        fotoVista: null,
      }),
    );

    expect(r).toEqual({ decidida: false, motivo: 'ja_decidida' });
    expect(await filaDa(pauta.id)).toEqual([]);
  });

  it('pauta que não existe', async () => {
    const r = await db.transaction((tx) =>
      aprovarPauta(tx, {
        pautaId: '00000000-0000-0000-0000-000000000000',
        curadorId,
        categoria: 'infraestrutura',
        fotoVista: null,
      }),
    );
    expect(r).toEqual({ decidida: false, motivo: 'pauta_inexistente' });
  });

  it.each([undefined, 'inventada'])(
    'categoria inválida (%s) recusa sem alterar pauta, evento ou aviso',
    async (categoria) => {
      const pauta = await novaEmCuradoria();
      const antes = await pautaDa(pauta.id);
      const r = await db.transaction((tx) =>
        aprovarPauta(tx, {
          pautaId: pauta.id,
          curadorId,
          categoria: categoria as string,
          fotoVista: null,
        }),
      );
      expect(r).toEqual({ decidida: false, motivo: 'categoria_invalida' });
      expect(await pautaDa(pauta.id)).toEqual(antes);
      expect(await eventosDa(pauta.id)).toEqual([]);
      expect(await filaDa(pauta.id)).toEqual([]);
    },
  );
});

describe('definirCategoria', () => {
  it('troca a categoria de pauta aprovada e recusa categoria desconhecida ou pauta não aprovada', async () => {
    const aprovada = await criarPauta(db, { status: 'juntando_apoios' });
    const emCuradoria = await novaEmCuradoria();
    const recusada = await criarPauta(db, { status: 'recusada' });
    expect(
      await db.transaction((tx) =>
        definirCategoria(tx, { pautaId: aprovada.id, categoria: 'ensino' }),
      ),
    ).toEqual({ feito: true });
    expect((await pautaDa(aprovada.id))?.categoria).toBe('ensino');
    expect(
      await db.transaction((tx) =>
        definirCategoria(tx, { pautaId: aprovada.id, categoria: 'outra' }),
      ),
    ).toEqual({ feito: false, motivo: 'categoria_invalida' });
    expect(
      await db.transaction((tx) =>
        definirCategoria(tx, { pautaId: emCuradoria.id, categoria: 'ensino' }),
      ),
    ).toEqual({ feito: false, motivo: 'pauta_nao_publicada' });
    expect(
      await db.transaction((tx) =>
        definirCategoria(tx, { pautaId: recusada.id, categoria: 'ensino' }),
      ),
    ).toEqual({ feito: false, motivo: 'pauta_nao_publicada' });
    expect((await pautaDa(aprovada.id))?.categoria).toBe('ensino');
    // A troca fica na linha do tempo, uma vez só.
    const trocas = (await eventosDa(aprovada.id)).filter((e) => e.tipo === 'categoria_alterada');
    expect(trocas).toHaveLength(1);
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
  it('recusa o relato pendente de quem criou a pauta e mantém relatos posteriores pendentes', async () => {
    const pauta = await criarPauta(db, { status: 'em_curadoria' });
    const owner = await criarEstudanteVerificado(db);
    const outraPessoa = await criarEstudanteVerificado(db);
    await db
      .insert(papeisPauta)
      .values({ pautaId: pauta.id, estudanteId: owner.id, papel: 'owner' });
    const origem = await criarRelato(db, {
      pautaId: pauta.id,
      estudanteId: owner.id,
      texto: 'Relato que criou a pauta.',
    });
    const relatoPosterior = await criarRelato(db, {
      pautaId: pauta.id,
      estudanteId: outraPessoa.id,
      texto: 'Relato de outra pessoa.',
    });
    const agora = new Date('2030-01-02T12:00:00.000Z');

    await db.transaction((tx) =>
      recusarPauta(tx, { pautaId: pauta.id, curadorId, motivo: 'Fora do escopo.', agora }),
    );

    expect(await db.select().from(relatos).where(eq(relatos.id, origem.id))).toMatchObject([
      { moderacao: 'recusado', moderadoEm: agora, moderadoPor: curadorId },
    ]);
    expect(await db.select().from(relatos).where(eq(relatos.id, relatoPosterior.id))).toMatchObject(
      [{ moderacao: 'pendente', moderadoEm: null, moderadoPor: null }],
    );
  });
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
    await db.transaction((tx) =>
      aprovarPauta(tx, {
        pautaId: pauta.id,
        curadorId,
        categoria: 'infraestrutura',
        fotoVista: null,
      }),
    );
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
