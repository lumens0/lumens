import { and, apoios, criarDb, criarPool, eq, eventos, papeisPauta, type Db } from '@lumens/db';
import { criarBancoEmMemoria, criarBancoTemporario } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarEstudanteVerificado, criarPauta, tornarOwner } from '../teste/fabricas';
import {
  adicionarCoOwner,
  podeVirarCoOwner,
  registrarAtividadeOwner,
  removerOwnerInativo,
} from './owners';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

const DIA = 86_400_000;
const AGORA = new Date('2026-11-07T12:00:00.000Z');
const diasAntes = (n: number) => new Date(AGORA.getTime() - n * DIA);

const apoiar = (pautaId: string, estudanteId: string) =>
  db.insert(apoios).values({ pautaId, estudanteId, origem: 'bot' });

const adicionar = (pautaId: string, estudanteId: string) =>
  db.transaction((tx) => adicionarCoOwner(tx, { pautaId, estudanteId, agora: AGORA }));

const ownersAtivos = async (pautaId: string) =>
  (
    await db
      .select({ estudanteId: papeisPauta.estudanteId, ate: papeisPauta.ate })
      .from(papeisPauta)
      .where(eq(papeisPauta.pautaId, pautaId))
  ).filter((o) => o.ate === null);

const eventosDa = async (pautaId: string) =>
  db
    .select({ tipo: eventos.tipo, dados: eventos.dados })
    .from(eventos)
    .where(eq(eventos.pautaId, pautaId));

/** Pauta com o owner criador e `n` apoiadores ainda sem papel. */
async function pautaComApoiadores(n: number) {
  const pauta = await criarPauta(db);
  const criador = await criarEstudanteVerificado(db);
  await apoiar(pauta.id, criador.id);
  await tornarOwner(db, pauta.id, criador.id);
  const apoiadores = [];
  for (let i = 0; i < n; i++) {
    const e = await criarEstudanteVerificado(db);
    await apoiar(pauta.id, e.id);
    apoiadores.push(e);
  }
  return { pauta, criador, apoiadores };
}

describe('adicionarCoOwner (RN06)', () => {
  it('apoiador vira co-owner enquanto há menos de 3 owners ativos', async () => {
    const { pauta, apoiadores } = await pautaComApoiadores(2);

    for (const a of apoiadores) {
      expect(await adicionar(pauta.id, a.id)).toEqual({ adicionado: true });
    }

    expect(await ownersAtivos(pauta.id)).toHaveLength(3);
    expect(await eventosDa(pauta.id)).toEqual([
      { tipo: 'owner_entrou', dados: { papel: 'co_owner' } },
      { tipo: 'owner_entrou', dados: { papel: 'co_owner' } },
    ]);
  });

  it('quarto owner é recusado', async () => {
    const { pauta, apoiadores } = await pautaComApoiadores(3);
    const [a, b, c] = apoiadores;
    if (a === undefined || b === undefined || c === undefined) throw new Error('faltou apoiador');
    await adicionar(pauta.id, a.id);
    await adicionar(pauta.id, b.id);

    expect(await adicionar(pauta.id, c.id)).toEqual({
      adicionado: false,
      motivo: 'limite_de_owners',
    });
    expect(await ownersAtivos(pauta.id)).toHaveLength(3);
  });

  it('quem não apoiou a pauta não vira co-owner', async () => {
    const { pauta } = await pautaComApoiadores(0);
    const estranho = await criarEstudanteVerificado(db);

    expect(await adicionar(pauta.id, estranho.id)).toEqual({
      adicionado: false,
      motivo: 'nao_apoiou',
    });
  });

  it('quem já é owner não entra de novo', async () => {
    const { pauta, criador } = await pautaComApoiadores(0);
    expect(await adicionar(pauta.id, criador.id)).toEqual({
      adicionado: false,
      motivo: 'ja_e_owner',
    });
  });
});

describe('podeVirarCoOwner (convite do bot)', () => {
  const pode = (pautaId: string, estudanteId: string) =>
    podeVirarCoOwner(db, { pautaId, estudanteId });

  it('apoiador sem papel, com vaga, pode; quem não apoiou e quem já é owner não', async () => {
    const { pauta, criador, apoiadores } = await pautaComApoiadores(1);
    const [a] = apoiadores;
    if (a === undefined) throw new Error('faltou apoiador');
    const estranho = await criarEstudanteVerificado(db);

    expect(await pode(pauta.id, a.id)).toBe(true);
    expect(await pode(pauta.id, estranho.id)).toBe(false);
    expect(await pode(pauta.id, criador.id)).toBe(false);
  });

  it('com 3 owners ativos, ninguém mais pode', async () => {
    const { pauta, apoiadores } = await pautaComApoiadores(3);
    const [a, b, c] = apoiadores;
    if (a === undefined || b === undefined || c === undefined) throw new Error('faltou apoiador');
    await adicionar(pauta.id, a.id);
    await adicionar(pauta.id, b.id);

    expect(await pode(pauta.id, c.id)).toBe(false);
  });
});

describe('removerOwnerInativo (RF-A03)', () => {
  async function ownerComAtividade(dias: number) {
    const { pauta, criador } = await pautaComApoiadores(0);
    await db
      .update(papeisPauta)
      .set({ ultimaAtividadeEm: diasAntes(dias) })
      .where(and(eq(papeisPauta.pautaId, pauta.id), eq(papeisPauta.estudanteId, criador.id)));
    return { pauta, criador };
  }

  const remover = (pautaId: string) =>
    db.transaction((tx) => removerOwnerInativo(tx, { pautaId, agora: AGORA }));

  it('owner com 31 dias sem atividade perde o papel; a linha fica com `ate`', async () => {
    const { pauta } = await ownerComAtividade(31);

    expect(await remover(pauta.id)).toEqual({ removidos: 1, vagaAberta: true });

    const linhas = await db
      .select({ ate: papeisPauta.ate })
      .from(papeisPauta)
      .where(eq(papeisPauta.pautaId, pauta.id));
    expect(linhas).toEqual([{ ate: AGORA }]);
    expect(await eventosDa(pauta.id)).toEqual([
      { tipo: 'owner_removido', dados: { papel: 'owner' } },
    ]);
  });

  it('owner com 29 dias sem atividade continua', async () => {
    const { pauta } = await ownerComAtividade(29);
    expect(await remover(pauta.id)).toEqual({ removidos: 0, vagaAberta: false });
    expect(await ownersAtivos(pauta.id)).toHaveLength(1);
  });

  it('30 dias completos já remove', async () => {
    const { pauta } = await ownerComAtividade(30);
    expect(await remover(pauta.id)).toMatchObject({ removidos: 1 });
  });

  it('atividade registrada renova o prazo', async () => {
    const { pauta, criador } = await ownerComAtividade(31);
    await db.transaction((tx) =>
      registrarAtividadeOwner(tx, { pautaId: pauta.id, estudanteId: criador.id, agora: AGORA }),
    );

    expect(await remover(pauta.id)).toEqual({ removidos: 0, vagaAberta: false });
  });

  it('owner removido libera vaga: um novo co-owner entra com a pauta que estava cheia', async () => {
    const { pauta, criador, apoiadores } = await pautaComApoiadores(3);
    const [a, b, c] = apoiadores;
    if (a === undefined || b === undefined || c === undefined) throw new Error('faltou apoiador');
    await adicionar(pauta.id, a.id);
    await adicionar(pauta.id, b.id);
    await db
      .update(papeisPauta)
      .set({ ultimaAtividadeEm: diasAntes(40) })
      .where(and(eq(papeisPauta.pautaId, pauta.id), eq(papeisPauta.estudanteId, criador.id)));

    await remover(pauta.id);

    expect(await adicionar(pauta.id, c.id)).toEqual({ adicionado: true });
    expect(await ownersAtivos(pauta.id)).toHaveLength(3);
  });
});

// Concorrência precisa de duas conexões ao mesmo tempo, o que o PGlite não tem.
const URL_TESTE = process.env.DATABASE_URL_TESTE;
if (!URL_TESTE && process.env.CI) throw new Error('No CI, defina DATABASE_URL_TESTE.');

describe.skipIf(!URL_TESTE)('adicionarCoOwner com Postgres de verdade', () => {
  it('cinco pedidos simultâneos pela última vaga: só um entra', async () => {
    const temporario = await criarBancoTemporario(URL_TESTE ?? '');
    // Com tratador de erro: apagar o banco temporário derruba as conexões (57P01).
    const pool = criarPool(
      temporario.url,
      { conexaoMs: 5000, consultaMs: 15_000 },
      () => undefined,
    );
    const real = criarDb(pool);
    try {
      const pauta = await criarPauta(real);
      const pessoas = [];
      for (let i = 0; i < 7; i++) pessoas.push(await criarEstudanteVerificado(real));
      for (const e of pessoas) {
        await real.insert(apoios).values({ pautaId: pauta.id, estudanteId: e.id, origem: 'bot' });
      }
      const [criador, co, ...candidatos] = pessoas;
      if (criador === undefined || co === undefined) throw new Error('faltou estudante');
      await tornarOwner(real, pauta.id, criador.id);
      await real.transaction((tx) =>
        adicionarCoOwner(tx, { pautaId: pauta.id, estudanteId: co.id }),
      );

      // Abre uma conexão por candidato antes da disputa; sem isso a primeira transação termina
      // enquanto as outras ainda conectam, e a corrida não acontece.
      await Promise.all(candidatos.map(() => pool.query('select pg_sleep(0.05)')));

      const resultados = await Promise.all(
        candidatos.map((e) =>
          real.transaction((tx) => adicionarCoOwner(tx, { pautaId: pauta.id, estudanteId: e.id })),
        ),
      );

      expect(resultados.filter((r) => r.adicionado)).toHaveLength(1);
      const ativos = await real
        .select({ ate: papeisPauta.ate })
        .from(papeisPauta)
        .where(eq(papeisPauta.pautaId, pauta.id));
      expect(ativos.filter((o) => o.ate === null)).toHaveLength(3);
    } finally {
      await pool.end();
      await temporario.apagar();
    }
  }, 30_000);
});
