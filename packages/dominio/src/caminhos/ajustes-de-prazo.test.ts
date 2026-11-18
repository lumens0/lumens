import { apoios, caminhos, disparos, eq, eventos, promessas, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarCurador, criarEstudanteVerificado, criarPauta } from '../teste/fabricas';
import { registrarProtocolo } from './caminho-registro';
import {
  registrarProrrogacao,
  corrigirDataDoProtocolo,
  remarcarDataPrometida,
} from './ajustes-de-prazo';
import { registrarPromessa } from './promessa';

let db: Db;
beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

async function protocolo(hoje: string) {
  const pauta = await criarPauta(db, { criadaEm: new Date('2026-10-01T12:00:00Z') });
  const [caminho] = await db
    .insert(caminhos)
    .values({ pautaId: pauta.id, tipo: 'falabr', status: 'aberto' })
    .returning();
  if (!caminho) throw new Error('caminho ausente');
  const registrado = await db.transaction((tx) =>
    registrarProtocolo(tx, {
      caminhoId: caminho.id,
      protocolo: '23546.000001/2026-10',
      abertoEm: hoje,
    }),
  );
  expect(registrado.registrado).toBe(true);
  return { pauta, caminhoId: caminho.id };
}

describe('ajustes de prazo (SCRUM-321)', () => {
  it('prorroga uma única vez antes do vencimento e grava evento público com as duas datas', async () => {
    const { pauta, caminhoId } = await protocolo('2026-10-15');
    const entrada = {
      caminhoId,
      curadorId: (await criarCurador(db)).id,
      motivo: 'Prazo solicitado',
      fonte: 'Ofício 1',
      agora: new Date('2026-11-10T12:00:00Z'),
    };
    expect(await db.transaction((tx) => registrarProrrogacao(tx, entrada))).toEqual({
      feito: true,
    });
    expect(await db.transaction((tx) => registrarProrrogacao(tx, entrada))).toEqual({
      feito: false,
      motivo: 'ja_prorrogado',
    });
    const [caminho] = await db
      .select({ prazo: caminhos.prazo })
      .from(caminhos)
      .where(eq(caminhos.id, caminhoId));
    expect(caminho?.prazo).toBe('2026-12-14');
    const linha = await db
      .select({ dados: eventos.dados, publico: eventos.publico })
      .from(eventos)
      .where(eq(eventos.pautaId, pauta.id));
    const prorrogacao = linha.find((evento) => evento.dados.data_nova === '2026-12-14');
    expect(prorrogacao).toMatchObject({
      dados: {
        data_antiga: '2026-11-14',
        data_nova: '2026-12-14',
        motivo: 'Prazo solicitado',
        fonte: 'Ofício 1',
      },
      publico: true,
    });
  });

  it('recusa motivo/fonte vazios e prazo vencido sem gravar mudança', async () => {
    const { caminhoId } = await protocolo('2026-10-15');
    const curadorId = (await criarCurador(db)).id;
    const base = {
      caminhoId,
      curadorId,
      motivo: ' ',
      fonte: 'Ofício',
      agora: new Date('2026-11-10T12:00:00Z'),
    };
    expect(await db.transaction((tx) => registrarProrrogacao(tx, base))).toEqual({
      feito: false,
      motivo: 'entrada_invalida',
    });
    expect(
      await db.transaction((tx) =>
        registrarProrrogacao(tx, {
          ...base,
          motivo: 'Solicitação',
          fonte: '  ',
        }),
      ),
    ).toEqual({ feito: false, motivo: 'entrada_invalida' });
    expect(
      await db.transaction((tx) =>
        registrarProrrogacao(tx, {
          ...base,
          motivo: 'Solicitação',
          agora: new Date('2026-11-20T12:00:00Z'),
        }),
      ),
    ).toEqual({ feito: false, motivo: 'prazo_vencido' });
  });

  it('corrige a data do protocolo e recalcula o prazo prorrogado', async () => {
    const { caminhoId } = await protocolo('2026-10-15');
    const curadorId = (await criarCurador(db)).id;
    await db.transaction((tx) =>
      registrarProrrogacao(tx, {
        caminhoId,
        curadorId,
        motivo: 'Pedido formal',
        fonte: 'Ofício 2',
        agora: new Date('2026-11-10T12:00:00Z'),
      }),
    );
    const resultado = await db.transaction((tx) =>
      corrigirDataDoProtocolo(tx, {
        caminhoId,
        curadorId,
        data: '2026-10-20',
        motivo: 'Data digitada incorretamente',
        fonte: 'Comprovante',
        agora: new Date('2026-11-10T12:00:00Z'),
      }),
    );
    expect(resultado).toEqual({ feito: true });
    const [caminho] = await db
      .select({ prazo: caminhos.prazo })
      .from(caminhos)
      .where(eq(caminhos.id, caminhoId));
    expect(caminho?.prazo).toBe('2026-12-19');
  });

  it('remarca antes da abertura, atualiza a conferência e enfileira aviso aos apoiadores', async () => {
    const pauta = await criarPauta(db, { status: 'cobrando' });
    const curador = await criarCurador(db);
    const estudante = await criarEstudanteVerificado(db);
    await db
      .insert(apoios)
      .values({ pautaId: pauta.id, estudanteId: estudante.id, origem: 'site' });
    const promessa = await db.transaction((tx) =>
      registrarPromessa(tx, {
        pautaId: pauta.id,
        registradaPor: curador.id,
        resumo: 'Troca do equipamento',
        fonte: 'UFAL',
        dataEntrega: '2026-12-01',
      }),
    );
    expect(
      await db.transaction((tx) =>
        remarcarDataPrometida(tx, {
          promessaId: promessa.promessaId,
          curadorId: curador.id,
          dataEntrega: '2026-11-19',
          motivo: 'Data inválida',
          fonte: 'Comunicado',
          agora: new Date('2026-11-20T12:00:00Z'),
        }),
      ),
    ).toEqual({ feito: false, motivo: 'data_no_passado' });
    for (const dataEntrega of ['2028-11-21', '9999-12-31']) {
      expect(
        await db.transaction((tx) =>
          remarcarDataPrometida(tx, {
            promessaId: promessa.promessaId,
            curadorId: curador.id,
            dataEntrega,
            motivo: 'Data distante',
            fonte: 'Comunicado',
            agora: new Date('2026-11-20T12:00:00Z'),
          }),
        ),
      ).toEqual({ feito: false, motivo: 'data_distante' });
    }
    const resultado = await db.transaction((tx) =>
      remarcarDataPrometida(tx, {
        promessaId: promessa.promessaId,
        curadorId: curador.id,
        dataEntrega: '2026-12-10',
        motivo: 'A entrega foi adiada',
        fonte: 'Comunicado',
        agora: new Date('2026-11-20T12:00:00Z'),
      }),
    );
    expect(resultado).toEqual({ feito: true });
    const [atualizada] = await db
      .select()
      .from(promessas)
      .where(eq(promessas.id, promessa.promessaId));
    expect(atualizada?.dataEntrega).toBe('2026-12-10');
    expect(atualizada?.conferenciaAbreEm.toISOString()).toBe('2026-12-10T03:00:00.000Z');
    const [eventoRemarcado] = await db
      .select({ id: eventos.id })
      .from(eventos)
      .where(eq(eventos.tipo, 'promessa_remarcada'));
    expect(
      await db
        .select({ tipo: disparos.tipo, parametros: disparos.parametros })
        .from(disparos)
        .where(eq(disparos.aviso, eventoRemarcado?.id ?? '')),
    ).toContainEqual({
      tipo: 'remarcacao',
      parametros: [pauta.titulo, '01/12/2026', '10/12/2026', pauta.slug],
    });
    expect(
      await db.transaction((tx) =>
        remarcarDataPrometida(tx, {
          promessaId: promessa.promessaId,
          curadorId: curador.id,
          dataEntrega: '2026-12-12',
          motivo: 'Alteração',
          fonte: 'Comunicado',
          agora: new Date('2026-12-10T03:00:00Z'),
        }),
      ),
    ).toEqual({ feito: false, motivo: 'conferencia_aberta' });
  });

  it('não mexe em caminho nem em promessa de outra pauta (o servidor confere a pauta do formulário)', async () => {
    const { caminhoId } = await protocolo('2026-10-15');
    const outra = await criarPauta(db, { status: 'cobrando' });
    const curador = await criarCurador(db);
    const agora = new Date('2026-11-10T12:00:00Z');
    expect(
      await db.transaction((tx) =>
        registrarProrrogacao(tx, {
          caminhoId,
          pautaId: outra.id,
          curadorId: curador.id,
          motivo: 'Prazo solicitado',
          fonte: 'Ofício 1',
          agora,
        }),
      ),
    ).toEqual({ feito: false, motivo: 'caminho_inexistente' });
    expect(
      await db.transaction((tx) =>
        corrigirDataDoProtocolo(tx, {
          caminhoId,
          pautaId: outra.id,
          curadorId: curador.id,
          data: '2026-10-10',
          motivo: 'Erro de digitação',
          fonte: 'Protocolo',
          agora,
        }),
      ),
    ).toEqual({ feito: false, motivo: 'caminho_inexistente' });
    const [caminho] = await db
      .select({ prazo: caminhos.prazo, prorrogado: caminhos.prorrogado })
      .from(caminhos)
      .where(eq(caminhos.id, caminhoId));
    expect(caminho?.prorrogado).toBe(false);

    const promessa = await db.transaction((tx) =>
      registrarPromessa(tx, {
        pautaId: outra.id,
        registradaPor: curador.id,
        resumo: 'Troca do equipamento',
        fonte: 'UFAL',
        dataEntrega: '2026-12-01',
      }),
    );
    const [pautaDoCaminho] = await db
      .select({ pautaId: caminhos.pautaId })
      .from(caminhos)
      .where(eq(caminhos.id, caminhoId));
    expect(
      await db.transaction((tx) =>
        remarcarDataPrometida(tx, {
          promessaId: promessa.promessaId,
          pautaId: pautaDoCaminho?.pautaId ?? '',
          curadorId: curador.id,
          dataEntrega: '2026-12-10',
          motivo: 'A entrega foi adiada',
          fonte: 'Comunicado',
          agora,
        }),
      ),
    ).toEqual({ feito: false, motivo: 'promessa_inexistente' });
    const [intacta] = await db
      .select({ dataEntrega: promessas.dataEntrega })
      .from(promessas)
      .where(eq(promessas.id, promessa.promessaId));
    expect(intacta?.dataEntrega).toBe('2026-12-01');
  });
});
