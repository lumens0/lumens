import { apoios, disparos, eq, estudantes, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { ajustarMeta, corrigirBloco } from '../pauta/ajustes-meta';
import { definirCategoria, marcarUrgencia } from '../pauta/curadoria';
import {
  criarBloco,
  criarCurador,
  criarEstudanteVerificado,
  criarPauta,
  tornarOwner,
} from '../teste/fabricas';
import { MODELO_PAUTA_ALTERADA, MOTIVO_SEM_TEXTO, textoDaAlteracao } from './aviso-alteracao';

let db: Db;
beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

const apoiar = (pautaId: string, estudanteId: string) =>
  db.insert(apoios).values({ pautaId, estudanteId, origem: 'bot' });

/** Pauta com um owner, um apoiador e um estudante que não tem a ver com ela. */
async function cenario(campos: Parameters<typeof criarPauta>[1] = {}) {
  const pauta = await criarPauta(db, { meta: 120, titulo: 'Goteira no auditório', ...campos });
  const owner = await criarEstudanteVerificado(db);
  const apoiador = await criarEstudanteVerificado(db);
  const estranho = await criarEstudanteVerificado(db);
  await tornarOwner(db, pauta.id, owner.id);
  await apoiar(pauta.id, owner.id);
  await apoiar(pauta.id, apoiador.id);
  return { pauta, owner, apoiador, estranho };
}

const destinatarios = async (aviso: string) =>
  (await db.select().from(disparos).where(eq(disparos.aviso, aviso))).map((d) => d.estudanteId);

describe('aviso de alteração da curadoria (SCRUM-401)', () => {
  it('meta ajustada: owner e quem apoiou recebem uma vez, com o antes, o depois e o motivo', async () => {
    const { pauta, owner, apoiador, estranho } = await cenario();
    const curador = await criarCurador(db);

    const r = await db.transaction((tx) =>
      ajustarMeta(tx, {
        pautaId: pauta.id,
        curadorId: curador.id,
        meta: 60,
        motivo: 'a base do bloco era menor',
      }),
    );
    expect(r).toEqual({ feito: true });

    const linhas = (await db.select().from(disparos).where(eq(disparos.tipo, 'alteracao'))).filter(
      (l) => l.parametros[3] === pauta.slug,
    );
    const quem = linhas.map((l) => l.estudanteId).sort();
    expect(quem).toEqual([owner.id, apoiador.id].sort());
    expect(quem).not.toContain(estranho.id);
    expect(linhas[0]).toMatchObject({
      tipo: 'alteracao',
      modelo: MODELO_PAUTA_ALTERADA,
      parametros: [
        'Goteira no auditório',
        'a meta passou de 120 para 60 apoios',
        'a base do bloco era menor',
        pauta.slug,
      ],
    });
  });

  it('quem saiu do Lumens não recebe', async () => {
    const { pauta, apoiador } = await cenario();
    await db.update(estudantes).set({ saiuEm: new Date() }).where(eq(estudantes.id, apoiador.id));
    const curador = await criarCurador(db);

    await db.transaction((tx) =>
      ajustarMeta(tx, { pautaId: pauta.id, curadorId: curador.id, meta: 80, motivo: 'ajuste' }),
    );

    const linhas = await db.select().from(disparos).where(eq(disparos.tipo, 'alteracao'));
    const dessaPauta = linhas.filter((l) => l.parametros[3] === pauta.slug);
    expect(dessaPauta.map((l) => l.estudanteId)).not.toContain(apoiador.id);
    expect(dessaPauta).toHaveLength(1);
  });

  it('alteração recusada não enfileira nada (meta abaixo dos apoios, meta inválida)', async () => {
    const { pauta } = await cenario();
    const curador = await criarCurador(db);
    const antes = (await db.select().from(disparos)).length;

    const abaixo = await db.transaction((tx) =>
      ajustarMeta(tx, { pautaId: pauta.id, curadorId: curador.id, meta: 2, motivo: 'x' }),
    );
    const invalida = await db.transaction((tx) =>
      ajustarMeta(tx, { pautaId: pauta.id, curadorId: curador.id, meta: 1000, motivo: 'x' }),
    );

    expect(abaixo).toMatchObject({ feito: false });
    expect(invalida).toMatchObject({ feito: false });
    expect((await db.select().from(disparos)).length).toBe(antes);
  });

  it('categoria alterada: só quem cuida da pauta recebe, e o aviso diz que não há motivo digitado', async () => {
    const { pauta, owner, apoiador } = await cenario({ categoria: 'infraestrutura' });

    await db.transaction((tx) => definirCategoria(tx, { pautaId: pauta.id, categoria: 'ensino' }));

    const linhas = (await db.select().from(disparos).where(eq(disparos.tipo, 'alteracao'))).filter(
      (l) => l.parametros[3] === pauta.slug,
    );
    expect(linhas.map((l) => l.estudanteId)).toEqual([owner.id]);
    expect(linhas.map((l) => l.estudanteId)).not.toContain(apoiador.id);
    expect(linhas[0]?.parametros).toEqual([
      'Goteira no auditório',
      'a categoria passou de Infraestrutura para Ensino',
      MOTIVO_SEM_TEXTO,
      pauta.slug,
    ]);
  });

  it('trocar pela mesma categoria não avisa ninguém', async () => {
    const { pauta } = await cenario({ categoria: 'ensino' });
    const antes = (await db.select().from(disparos)).length;
    await db.transaction((tx) => definirCategoria(tx, { pautaId: pauta.id, categoria: 'ensino' }));
    expect((await db.select().from(disparos)).length).toBe(antes);
  });

  it('urgência marcada avisa o owner sem o motivo interno', async () => {
    const { pauta, owner } = await cenario();
    const curador = await criarCurador(db);

    await db.transaction((tx) =>
      marcarUrgencia(tx, {
        pautaId: pauta.id,
        curadorId: curador.id,
        urgente: true,
        motivo: 'cita uma pessoa, só para o painel',
      }),
    );

    const linhas = (await db.select().from(disparos).where(eq(disparos.tipo, 'alteracao'))).filter(
      (l) => l.parametros[3] === pauta.slug,
    );
    expect(linhas.map((l) => l.estudanteId)).toEqual([owner.id]);
    expect(linhas[0]?.parametros[1]).toBe('ela foi marcada como urgente');
    expect(linhas[0]?.parametros.join(' ')).not.toContain('só para o painel');
  });

  it('corrigir o bloco avisa o antes e o depois do bloco e da meta', async () => {
    const antigo = await criarBloco(db, 1200); // meta 120
    const novo = await criarBloco(db, 300); // meta 30
    const { pauta, apoiador, owner } = await cenario({ blocoId: antigo.id });
    const curador = await criarCurador(db);

    const r = await db.transaction((tx) =>
      corrigirBloco(tx, {
        pautaId: pauta.id,
        curadorId: curador.id,
        blocoId: novo.id,
        motivo: 'a pauta era do outro prédio',
      }),
    );
    expect(r).toEqual({ feito: true });

    const linhas = (await db.select().from(disparos).where(eq(disparos.tipo, 'alteracao'))).filter(
      (l) => l.parametros[3] === pauta.slug,
    );
    expect(linhas.map((l) => l.estudanteId).sort()).toEqual([owner.id, apoiador.id].sort());
    expect(linhas[0]?.parametros[1]).toBe(
      `o bloco passou de ${antigo.nome} para ${novo.nome} e a meta, de 120 para 30 apoios`,
    );
  });

  it('duas alterações seguidas mandam dois avisos: a chave é o evento, não a pauta', async () => {
    const { pauta, owner } = await cenario();
    const curador = await criarCurador(db);
    for (const meta of [90, 70]) {
      await db.transaction((tx) =>
        ajustarMeta(tx, { pautaId: pauta.id, curadorId: curador.id, meta, motivo: 'ajuste' }),
      );
    }
    const doOwner = (
      await db.select().from(disparos).where(eq(disparos.estudanteId, owner.id))
    ).filter((d) => d.tipo === 'alteracao');
    expect(doOwner).toHaveLength(2);
    expect(new Set(doOwner.map((d) => d.aviso)).size).toBe(2);
    expect((await destinatarios(doOwner[0]?.aviso ?? '')).length).toBeGreaterThan(0);
  });
});

describe('textoDaAlteracao', () => {
  it('escreve o que mudou para cada tipo', () => {
    expect(textoDaAlteracao({ tipo: 'meta', metaAntes: 120, metaDepois: 60 })).toBe(
      'a meta passou de 120 para 60 apoios',
    );
    expect(
      textoDaAlteracao({
        tipo: 'bloco',
        blocoAntes: null,
        blocoDepois: 'IC - Instituto de Computação',
        metaAntes: 300,
        metaDepois: 59,
      }),
    ).toBe(
      'o bloco passou de todo o campus para IC - Instituto de Computação e a meta, de 300 para 59 apoios',
    );
    expect(textoDaAlteracao({ tipo: 'categoria', de: 'seguranca', para: 'tecnologia' })).toBe(
      'a categoria passou de Segurança para Tecnologia',
    );
    expect(textoDaAlteracao({ tipo: 'urgencia', urgente: false })).toBe(
      'ela deixou de ser urgente',
    );
  });
});
