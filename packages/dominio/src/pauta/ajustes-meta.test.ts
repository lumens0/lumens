import { apoios, eq, eventos, pautas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { ajustarMeta, corrigirBloco } from './ajustes-meta';
import { criarBloco, criarCurador, criarEstudanteVerificado, criarPauta } from '../teste/fabricas';

let db: Db;
let curadorId: string;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
  curadorId = (await criarCurador(db)).id;
});

describe('ajustes de bloco e meta', () => {
  it('devolve recusas para ids inválidos sem consultar UUIDs malformados no banco', async () => {
    expect(
      await db.transaction((tx) =>
        ajustarMeta(tx, {
          pautaId: 'id inválido',
          curadorId,
          meta: 50,
          motivo: 'Motivo válido.',
        }),
      ),
    ).toEqual({ feito: false, motivo: 'pauta_inexistente' });
    const pauta = await criarPauta(db, { status: 'em_curadoria' });
    expect(
      await db.transaction((tx) =>
        corrigirBloco(tx, {
          pautaId: pauta.id,
          curadorId,
          blocoId: 'id inválido',
          motivo: 'Motivo válido.',
        }),
      ),
    ).toEqual({ feito: false, motivo: 'bloco_inexistente' });
  });

  it('aceita os limites mínimo e máximo da meta manual e recusa valores fora deles', async () => {
    const pauta = await criarPauta(db, { status: 'em_curadoria', meta: 300 });
    expect(
      await db.transaction((tx) =>
        ajustarMeta(tx, {
          pautaId: pauta.id,
          curadorId,
          meta: 30,
          motivo: 'Meta mínima justificada.',
        }),
      ),
    ).toEqual({ feito: true });
    expect(
      await db.transaction((tx) =>
        ajustarMeta(tx, {
          pautaId: pauta.id,
          curadorId,
          meta: 300,
          motivo: 'Meta máxima justificada.',
        }),
      ),
    ).toEqual({ feito: true });
    expect(
      await db.transaction((tx) =>
        ajustarMeta(tx, {
          pautaId: pauta.id,
          curadorId,
          meta: 29,
          motivo: 'Abaixo do mínimo.',
        }),
      ),
    ).toEqual({ feito: false, motivo: 'meta_invalida' });
    expect(
      await db.transaction((tx) =>
        ajustarMeta(tx, {
          pautaId: pauta.id,
          curadorId,
          meta: 301,
          motivo: 'Acima do máximo.',
        }),
      ),
    ).toEqual({ feito: false, motivo: 'meta_invalida' });
  });

  it('corrige o bloco, recalcula a meta pela RN04 e grava evento público com nomes', async () => {
    const origem = await criarBloco(db, 1_000);
    const destino = await criarBloco(db, 2_000);
    const pauta = await criarPauta(db, { status: 'em_curadoria', blocoId: origem.id, meta: 100 });
    const resultado = await db.transaction((tx) =>
      corrigirBloco(tx, {
        pautaId: pauta.id,
        curadorId,
        blocoId: destino.id,
        motivo: 'O relato indicou o bloco errado.',
      }),
    );
    expect(resultado).toEqual({ feito: true });
    const [atualizada] = await db.select().from(pautas).where(eq(pautas.id, pauta.id));
    expect(atualizada).toMatchObject({ blocoId: destino.id, meta: 200 });
    const [evento] = await db.select().from(eventos).where(eq(eventos.pautaId, pauta.id));
    expect(evento).toMatchObject({
      tipo: 'bloco_corrigido',
      publico: true,
      dados: {
        blocoAntes: origem.nome,
        blocoDepois: destino.nome,
        metaAntes: 100,
        metaDepois: 200,
        motivo: 'O relato indicou o bloco errado.',
      },
    });
  });

  it('corrige para todo o campus com meta 300 e recusa meta que não supera os apoios', async () => {
    // 300 estudantes: a RN04 dá meta 30, igual aos 30 apoios da pauta.
    const bloco = await criarBloco(db, 300);
    const pauta = await criarPauta(db, { status: 'juntando_apoios', blocoId: bloco.id, meta: 100 });
    const estudantes = await Promise.all(
      Array.from({ length: 30 }, () => criarEstudanteVerificado(db)),
    );
    await db.insert(apoios).values(
      estudantes.map((estudante) => ({
        pautaId: pauta.id,
        estudanteId: estudante.id,
        origem: 'site' as const,
      })),
    );
    expect(
      await db.transaction((tx) =>
        corrigirBloco(tx, {
          pautaId: pauta.id,
          curadorId,
          blocoId: bloco.id,
          motivo: 'A meta proposta iguala os apoios.',
        }),
      ),
    ).toEqual({ feito: false, motivo: 'meta_abaixo_dos_apoios' });
    const resultado = await db.transaction((tx) =>
      corrigirBloco(tx, {
        pautaId: pauta.id,
        curadorId,
        blocoId: null,
        motivo: 'A pauta vale para o campus todo.',
      }),
    );
    expect(resultado).toEqual({ feito: true });
    const [atualizada] = await db.select().from(pautas).where(eq(pautas.id, pauta.id));
    expect(atualizada).toMatchObject({ blocoId: null, meta: 300 });
    expect(
      await db.transaction((tx) =>
        ajustarMeta(tx, {
          pautaId: pauta.id,
          curadorId,
          meta: 1,
          motivo: 'Ajuste inválido',
        }),
      ),
    ).toEqual({ feito: false, motivo: 'meta_invalida' });
    expect(
      await db.transaction((tx) =>
        ajustarMeta(tx, {
          pautaId: pauta.id,
          curadorId,
          meta: 45,
          motivo: '   ',
        }),
      ),
    ).toEqual({ feito: false, motivo: 'motivo_obrigatorio' });
  });

  it('ajusta meta dentro dos limites e recusa igualdade, apoio atingido, motivo vazio e cobrança', async () => {
    const pauta = await criarPauta(db, { status: 'juntando_apoios', meta: 300 });
    const estudantes = await Promise.all(
      Array.from({ length: 30 }, () => criarEstudanteVerificado(db)),
    );
    await db.insert(apoios).values(
      estudantes.map((estudante) => ({
        pautaId: pauta.id,
        estudanteId: estudante.id,
        origem: 'site' as const,
      })),
    );
    expect(
      await db.transaction((tx) =>
        ajustarMeta(tx, {
          pautaId: pauta.id,
          curadorId,
          meta: 31,
          motivo: 'Ajuste excepcional justificado.',
        }),
      ),
    ).toEqual({ feito: true });
    expect(
      await db.transaction((tx) =>
        ajustarMeta(tx, {
          pautaId: pauta.id,
          curadorId,
          meta: 30,
          motivo: 'Igual aos apoios.',
        }),
      ),
    ).toEqual({ feito: false, motivo: 'meta_abaixo_dos_apoios' });
    expect(
      await db.transaction((tx) =>
        ajustarMeta(tx, {
          pautaId: pauta.id,
          curadorId,
          meta: 40,
          motivo: '  ',
        }),
      ),
    ).toEqual({ feito: false, motivo: 'motivo_obrigatorio' });
    expect(
      await db.transaction((tx) =>
        ajustarMeta(tx, {
          pautaId: pauta.id,
          curadorId,
          meta: 40,
          motivo: 'm'.repeat(201),
        }),
      ),
    ).toEqual({ feito: false, motivo: 'motivo_obrigatorio' });
    expect(
      await db.transaction((tx) =>
        ajustarMeta(tx, {
          pautaId: pauta.id,
          curadorId,
          meta: 40,
          motivo: 'Linha 1\nLinha 2',
        }),
      ),
    ).toEqual({ feito: false, motivo: 'motivo_obrigatorio' });
    const cobrando = await criarPauta(db, { status: 'cobrando' });
    expect(
      await db.transaction((tx) =>
        ajustarMeta(tx, {
          pautaId: cobrando.id,
          curadorId,
          meta: 100,
          motivo: 'Não pode em cobrança.',
        }),
      ),
    ).toEqual({ feito: false, motivo: 'status_invalido' });
    const eventosDaPauta = await db.select().from(eventos).where(eq(eventos.pautaId, pauta.id));
    expect(eventosDaPauta).toHaveLength(1);
    expect(eventosDaPauta[0]).toMatchObject({
      tipo: 'meta_ajustada',
      publico: true,
      dados: {
        metaAntes: 300,
        metaDepois: 31,
        motivo: 'Ajuste excepcional justificado.',
      },
    });
  });
});
