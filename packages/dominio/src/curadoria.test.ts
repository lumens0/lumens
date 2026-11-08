import { eq, eventos, pautas, relatos, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { aprovarPauta, listarFilaDeCuradoria, recusarPauta } from './curadoria';
import { criarBloco, criarEstudanteVerificado, criarPauta } from './fabricas';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
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

  it('mostra a foto do relato que originou a pauta', async () => {
    const pauta = await novaEmCuradoria();
    const estudante = await criarEstudanteVerificado(db);
    await db.insert(relatos).values([
      { pautaId: pauta.id, estudanteId: estudante.id, texto: 'sem foto' },
      { pautaId: pauta.id, estudanteId: estudante.id, texto: 'com foto', fotoChave: 'fotos/a.jpg' },
    ]);

    const fila = await listarFilaDeCuradoria(db);

    expect(fila.find((p) => p.id === pauta.id)?.fotoChave).toBe('fotos/a.jpg');
  });
});

describe('aprovarPauta', () => {
  it('leva para juntando_apoios e registra pauta_aprovada pública', async () => {
    const pauta = await novaEmCuradoria();
    const agora = new Date('2030-01-02T12:00:00.000Z');

    const r = await db.transaction((tx) => aprovarPauta(tx, { pautaId: pauta.id, agora }));

    expect(r).toEqual({ decidida: true });
    expect(await pautaDa(pauta.id)).toMatchObject({ status: 'juntando_apoios', aprovadaEm: agora });
    expect(await eventosDa(pauta.id)).toEqual(
      expect.arrayContaining([
        { tipo: 'status_alterado', origem: 'curadoria', publico: true },
        { tipo: 'pauta_aprovada', origem: 'curadoria', publico: true },
      ]),
    );
  });

  it('pauta já decidida não muda nem ganha evento', async () => {
    const pauta = await novaEmCuradoria();
    await db.transaction((tx) => recusarPauta(tx, { pautaId: pauta.id, motivo: 'Duplicada.' }));
    const antes = await eventosDa(pauta.id);

    const r = await db.transaction((tx) => aprovarPauta(tx, { pautaId: pauta.id }));

    expect(r).toEqual({ decidida: false, motivo: 'ja_decidida' });
    expect((await pautaDa(pauta.id))?.status).toBe('recusada');
    expect(await eventosDa(pauta.id)).toHaveLength(antes.length);
  });

  it('pauta que não existe', async () => {
    const r = await db.transaction((tx) =>
      aprovarPauta(tx, { pautaId: '00000000-0000-0000-0000-000000000000' }),
    );
    expect(r).toEqual({ decidida: false, motivo: 'pauta_inexistente' });
  });
});

describe('recusarPauta', () => {
  it('grava o motivo e registra a recusa fora do site', async () => {
    const pauta = await novaEmCuradoria();

    const r = await db.transaction((tx) =>
      recusarPauta(tx, { pautaId: pauta.id, motivo: '  Já existe a pauta do bebedouro.  ' }),
    );

    expect(r).toEqual({ decidida: true });
    expect(await pautaDa(pauta.id)).toMatchObject({
      status: 'recusada',
      motivoRecusa: 'Já existe a pauta do bebedouro.',
    });
    expect(await eventosDa(pauta.id)).toEqual(
      expect.arrayContaining([
        { tipo: 'status_alterado', origem: 'curadoria', publico: false },
        { tipo: 'pauta_recusada', origem: 'curadoria', publico: false },
      ]),
    );
  });

  it.each(['', '   '])('recusa sem motivo (%j) é bloqueada e nada muda', async (motivo) => {
    const pauta = await novaEmCuradoria();

    const r = await db.transaction((tx) => recusarPauta(tx, { pautaId: pauta.id, motivo }));

    expect(r).toEqual({ decidida: false, motivo: 'motivo_obrigatorio' });
    expect((await pautaDa(pauta.id))?.status).toBe('em_curadoria');
    expect(await eventosDa(pauta.id)).toHaveLength(0);
  });
});
