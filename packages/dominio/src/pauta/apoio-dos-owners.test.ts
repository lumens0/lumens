import { apoios, blocoCursos, eq, estudantes, pautas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarBloco, criarEstudanteVerificado, criarPauta, tornarOwner } from '../teste/fabricas';
import { aplicarApoioDosOwners, conferirApoioDosOwners } from './apoio-dos-owners';

let db: Db;
beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

const apoiosDa = async (pautaId: string) =>
  (await db.select().from(apoios).where(eq(apoios.pautaId, pautaId))).length;

describe('apoio dos owners de pautas aprovadas antes da SCRUM-344', () => {
  it('conferir lista sem gravar; aplicar dá o apoio; rodar de novo não muda nada', async () => {
    const pauta = await criarPauta(db);
    const owner = await criarEstudanteVerificado(db);
    await tornarOwner(db, pauta.id, owner.id);

    const antes = await conferirApoioDosOwners(db);
    expect(antes.aplicaveis.map((o) => o.pautaId)).toContain(pauta.id);
    expect(await apoiosDa(pauta.id)).toBe(0);

    await aplicarApoioDosOwners(db);
    expect(await apoiosDa(pauta.id)).toBe(1);

    const depois = await conferirApoioDosOwners(db);
    expect([...depois.aplicaveis, ...depois.ignorados].map((o) => o.pautaId)).not.toContain(
      pauta.id,
    );
    const segunda = await aplicarApoioDosOwners(db);
    expect(segunda.registrados).toBe(0);
    expect(await apoiosDa(pauta.id)).toBe(1);
  });

  it('owner de outro curso que o do bloco fica em ignorados, e o apoio não é aplicado (SCRUM-399)', async () => {
    const bloco = await criarBloco(db);
    await db.insert(blocoCursos).values({ blocoId: bloco.id, curso: 'História' });
    const pauta = await criarPauta(db, { blocoId: bloco.id, categoria: 'ensino' });
    const owner = await criarEstudanteVerificado(db); // Ciência da Computação
    await tornarOwner(db, pauta.id, owner.id);

    const conferencia = await conferirApoioDosOwners(db);
    expect(conferencia.aplicaveis.map((o) => o.pautaId)).not.toContain(pauta.id);
    expect(conferencia.ignorados).toContainEqual(
      expect.objectContaining({ pautaId: pauta.id, ignoradoPor: 'fora_do_bloco' }),
    );

    await aplicarApoioDosOwners(db);
    expect(await apoiosDa(pauta.id)).toBe(0);
  });

  it('pula quem saiu do Lumens e pauta que não recebe apoio, e não mexe em pauta na curadoria', async () => {
    const saiu = await criarEstudanteVerificado(db);
    await db.update(estudantes).set({ saiuEm: new Date() }).where(eq(estudantes.id, saiu.id));
    const p1 = await criarPauta(db);
    await tornarOwner(db, p1.id, saiu.id);

    const dono = await criarEstudanteVerificado(db);
    const p2 = await criarPauta(db, { status: 'conquistada' });
    await tornarOwner(db, p2.id, dono.id);
    const p3 = await criarPauta(db, { status: 'em_curadoria' });
    await tornarOwner(db, p3.id, dono.id);

    const c = await conferirApoioDosOwners(db);
    const motivo = (id: string) => c.ignorados.find((o) => o.pautaId === id)?.ignoradoPor;
    expect(motivo(p1.id)).toBe('estudante_nao_verificado');
    expect(motivo(p2.id)).toBe('pauta_sem_apoio');
    expect([...c.aplicaveis, ...c.ignorados].map((o) => o.pautaId)).not.toContain(p3.id);

    await aplicarApoioDosOwners(db);
    expect(await apoiosDa(p1.id)).toBe(0);
    expect(await apoiosDa(p2.id)).toBe(0);
  });

  it('o contador público sobe em 1 e a meta batida pelo apoio novo segue a regra da aprovação', async () => {
    const pauta = await criarPauta(db, { meta: 1 });
    const owner = await criarEstudanteVerificado(db);
    await tornarOwner(db, pauta.id, owner.id);

    await aplicarApoioDosOwners(db);

    const [p] = await db.select().from(pautas).where(eq(pautas.id, pauta.id));
    expect(p?.status).toBe('meta_batida');
  });
});
