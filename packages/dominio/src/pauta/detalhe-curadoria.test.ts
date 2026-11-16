import {
  apoios,
  caminhos,
  eq,
  eventos,
  papeisPauta,
  promessas,
  respostasConferencia,
  relatos,
  estudantes,
  type Db,
} from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { detalharPautaDaCuradoria } from './detalhe-curadoria';
import { criarCurador, criarEstudanteVerificado, criarPauta } from '../teste/fabricas';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

describe('detalharPautaDaCuradoria', () => {
  it('reúne progresso, relatos, responsáveis sem dados pessoais, caminhos, promessa e votos', async () => {
    const pauta = await criarPauta(db, {
      status: 'cobrando',
      meta: 2,
      metaBatidaEm: new Date('2030-01-03T12:00:00Z'),
    });
    const curador = await criarCurador(db);
    const owner = await criarEstudanteVerificado(db);
    const coOwner = await criarEstudanteVerificado(db);
    const inativo = await criarEstudanteVerificado(db);
    const saiuDoPapel = await criarEstudanteVerificado(db);
    const apoiador1 = await criarEstudanteVerificado(db);
    const apoiador2 = await criarEstudanteVerificado(db);
    const relator = await criarEstudanteVerificado(db);
    await db
      .update(estudantes)
      .set({ curso: 'Arquitetura e Urbanismo' })
      .where(eq(estudantes.id, owner.id));
    await db.update(estudantes).set({ curso: 'Pedagogia' }).where(eq(estudantes.id, coOwner.id));
    await db.update(estudantes).set({ saiuEm: new Date() }).where(eq(estudantes.id, inativo.id));
    await db.insert(papeisPauta).values([
      { pautaId: pauta.id, estudanteId: owner.id, papel: 'owner' },
      { pautaId: pauta.id, estudanteId: coOwner.id, papel: 'co_owner' },
      { pautaId: pauta.id, estudanteId: inativo.id, papel: 'co_owner' },
      { pautaId: pauta.id, estudanteId: saiuDoPapel.id, papel: 'co_owner', ate: new Date() },
    ]);
    await db.insert(apoios).values([
      { pautaId: pauta.id, estudanteId: apoiador1.id, origem: 'site' },
      { pautaId: pauta.id, estudanteId: apoiador2.id, origem: 'bot' },
    ]);
    await db.insert(relatos).values([
      { pautaId: pauta.id, estudanteId: owner.id, texto: 'Relato inicial.', moderacao: 'pendente' },
      // O owner manda outro relato depois: sem moderação, nenhum dos dois tem data confiável.
      {
        pautaId: pauta.id,
        estudanteId: owner.id,
        texto: 'Relato posterior do owner.',
        moderacao: 'pendente',
      },
      {
        pautaId: pauta.id,
        estudanteId: relator.id,
        texto: 'Relato moderado.',
        fotoChave: 'fotos/relato.jpg',
        moderacao: 'aprovado',
        moderadoEm: new Date('2030-01-04T12:00:00Z'),
      },
      {
        pautaId: pauta.id,
        estudanteId: relator.id,
        texto: 'Relato recusado.',
        moderacao: 'recusado',
        moderadoEm: new Date('2030-01-05T12:00:00Z'),
      },
    ]);
    await db.insert(caminhos).values([
      {
        pautaId: pauta.id,
        tipo: 'falabr',
        status: 'aberto',
        protocolo: '2026.123',
        prazo: '2030-02-01',
      },
      { pautaId: pauta.id, tipo: 'comunidade', status: 'aberto' },
      { pautaId: pauta.id, tipo: 'representante', status: 'aberto', protocolo: 'REP-42' },
    ]);
    const [promessa] = await db
      .insert(promessas)
      .values({
        pautaId: pauta.id,
        resumo: 'Troca do equipamento.',
        fonte: 'Direção do campus',
        dataEntrega: '2030-01-20',
        registradaPor: curador.id,
        conferenciaAbreEm: new Date('2030-01-20T03:00:00Z'),
        conferenciaFechaEm: new Date('2030-01-27T03:00:00Z'),
      })
      .returning({ id: promessas.id });
    if (!promessa) throw new Error('promessa não criada');
    // Quem apoiou depois de a conferência abrir pode responder, mas o voto não entra na apuração
    // (conferencia-apuracao.ts); o painel mostra os mesmos totais.
    await db.insert(apoios).values({
      pautaId: pauta.id,
      estudanteId: relator.id,
      origem: 'bot',
      criadoEm: new Date('2030-01-21T12:00:00Z'),
    });
    await db.insert(respostasConferencia).values([
      { promessaId: promessa.id, estudanteId: apoiador1.id, resposta: 'sim' },
      { promessaId: promessa.id, estudanteId: apoiador2.id, resposta: 'em_parte' },
      { promessaId: promessa.id, estudanteId: relator.id, resposta: 'nao' },
    ]);
    await db.insert(eventos).values({
      pautaId: pauta.id,
      tipo: 'meta_batida',
      origem: 'agendador',
      criadoEm: new Date('2030-01-03T12:00:00Z'),
    });

    const detalhe = await detalharPautaDaCuradoria(db, pauta.id);

    expect(detalhe).toMatchObject({
      apoios: 3,
      meta: 2,
      metaBatidaEm: new Date('2030-01-03T12:00:00Z'),
      promessa: {
        resumo: 'Troca do equipamento.',
        fonte: 'Direção do campus',
        dataEntrega: '2030-01-20',
        votos: { sim: 1, em_parte: 1, nao: 0 },
      },
    });
    expect(detalhe?.responsaveis).toEqual(
      expect.arrayContaining([{ curso: 'Arquitetura e Urbanismo' }, { curso: 'Pedagogia' }]),
    );
    expect(
      [...(detalhe?.relatos ?? [])].sort((a, b) => a.texto.localeCompare(b.texto)),
    ).toMatchObject([
      {
        texto: 'Relato inicial.',
        curso: 'Arquitetura e Urbanismo',
        moderacao: 'pendente',
        data: null,
      },
      {
        texto: 'Relato moderado.',
        fotoChave: 'fotos/relato.jpg',
        moderacao: 'aprovado',
        data: new Date('2030-01-04T12:00:00Z'),
      },
      {
        texto: 'Relato posterior do owner.',
        curso: 'Arquitetura e Urbanismo',
        moderacao: 'pendente',
        data: null,
      },
      {
        texto: 'Relato recusado.',
        moderacao: 'recusado',
        data: new Date('2030-01-05T12:00:00Z'),
      },
    ]);
    expect(
      [...(detalhe?.caminhos ?? [])].sort((a, b) => a.tipo.localeCompare(b.tipo)),
    ).toMatchObject([
      { tipo: 'comunidade', protocolo: null, prazo: null },
      { tipo: 'falabr', protocolo: '2026.123', prazo: '2030-02-01' },
      { tipo: 'representante', protocolo: 'REP-42', prazo: null },
    ]);
    expect(detalhe?.responsaveis).toHaveLength(2);
    expect(
      detalhe?.responsaveis.every((responsavel) => Object.keys(responsavel).join(',') === 'curso'),
    ).toBe(true);
  });

  it('pauta inexistente retorna undefined', async () => {
    expect(
      await detalharPautaDaCuradoria(db, '00000000-0000-0000-0000-000000000000'),
    ).toBeUndefined();
  });
});
