import { apoios, disparos, eq, eventos, pautas, pedidosEdicao, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarCurador, criarEstudanteVerificado, criarPauta, tornarOwner } from '../teste/fabricas';
import { pautasEditaveisDoOwner } from './edicao';
import {
  decidirPedidoDeEdicao,
  editarPauta,
  listarPedidosDeEdicaoPendentes,
  pedidosPendentesDaPauta,
} from './pedido-edicao';

let db: Db;
let curadorId: string;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
  curadorId = (await criarCurador(db)).id;
});

/** Pauta pública (ou em curadoria) com um owner ativo. */
async function pautaComOwner(status: 'juntando_apoios' | 'em_curadoria' | 'recusada') {
  const pauta = await criarPauta(db, {
    status,
    titulo: 'Bebedouro quebrado',
    descricao: 'Não funciona há duas semanas.',
  });
  const owner = await criarEstudanteVerificado(db);
  await tornarOwner(db, pauta.id, owner.id);
  return { pauta, owner };
}

const editar = (
  pautaId: string,
  estudanteId: string,
  campo: 'titulo' | 'descricao',
  texto: string,
) => db.transaction((tx) => editarPauta(tx, { pautaId, estudanteId, campo, texto }));

const pautaDa = async (id: string) => (await db.select().from(pautas).where(eq(pautas.id, id)))[0];

describe('editarPauta', () => {
  it('em curadoria muda o texto direto, sem pedido', async () => {
    const { pauta, owner } = await pautaComOwner('em_curadoria');

    expect(await editar(pauta.id, owner.id, 'descricao', 'Agora vaza água.')).toEqual({
      editada: true,
      modo: 'direta',
    });

    expect((await pautaDa(pauta.id))?.descricao).toBe('Agora vaza água.');
    expect(await pedidosPendentesDaPauta(db, pauta.id)).toEqual([]);
  });

  it('publicada, o texto público não muda: vira pedido com o antes e o depois', async () => {
    const { pauta, owner } = await pautaComOwner('juntando_apoios');
    // Com apoio de outra pessoa: depois de publicada, isso não impede o pedido.
    const outra = await criarEstudanteVerificado(db);
    await db.insert(apoios).values({ pautaId: pauta.id, estudanteId: outra.id, origem: 'bot' });

    expect(await editar(pauta.id, owner.id, 'titulo', '  Bebedouro do bloco 12  ')).toEqual({
      editada: true,
      modo: 'pedido',
    });

    expect((await pautaDa(pauta.id))?.titulo).toBe('Bebedouro quebrado');
    expect(await pedidosPendentesDaPauta(db, pauta.id)).toMatchObject([
      { campo: 'titulo', antes: 'Bebedouro quebrado', depois: 'Bebedouro do bloco 12' },
    ]);
  });

  it('segundo pedido do mesmo campo espera o primeiro; o de outro campo passa', async () => {
    const { pauta, owner } = await pautaComOwner('juntando_apoios');
    await editar(pauta.id, owner.id, 'titulo', 'Título A');

    expect(await editar(pauta.id, owner.id, 'titulo', 'Título B')).toEqual({
      editada: false,
      motivo: 'pedido_pendente',
    });
    expect(await editar(pauta.id, owner.id, 'descricao', 'Descrição B')).toEqual({
      editada: true,
      modo: 'pedido',
    });
    expect(await pedidosPendentesDaPauta(db, pauta.id)).toHaveLength(2);
  });

  it('texto igual ao publicado não cria pedido', async () => {
    const { pauta, owner } = await pautaComOwner('juntando_apoios');
    expect(await editar(pauta.id, owner.id, 'titulo', 'Bebedouro quebrado')).toEqual({
      editada: true,
      modo: 'sem_mudanca',
    });
    expect(await pedidosPendentesDaPauta(db, pauta.id)).toEqual([]);
  });

  it('só o owner ativo pede; texto vazio, longo e pauta recusada são recusados', async () => {
    const { pauta, owner } = await pautaComOwner('juntando_apoios');
    const outra = await criarEstudanteVerificado(db);

    expect(await editar(pauta.id, outra.id, 'titulo', 'Outro')).toEqual({
      editada: false,
      motivo: 'nao_e_owner',
    });
    expect(await editar(pauta.id, owner.id, 'titulo', '   ')).toEqual({
      editada: false,
      motivo: 'texto_vazio',
    });
    expect(await editar(pauta.id, owner.id, 'titulo', 'x'.repeat(81))).toEqual({
      editada: false,
      motivo: 'texto_longo',
    });
    const recusada = await pautaComOwner('recusada');
    expect(await editar(recusada.pauta.id, recusada.owner.id, 'titulo', 'Novo')).toEqual({
      editada: false,
      motivo: 'pauta_fechada',
    });
    expect(await pedidosPendentesDaPauta(db, pauta.id)).toEqual([]);
  });

  it('texto com e-mail, telefone ou matrícula é barrado já no pedido, sem gravar nada', async () => {
    const { pauta, owner } = await pautaComOwner('juntando_apoios');
    for (const texto of ['Falem comigo: fulano@ufal.br', 'Meu celular é (82) 99999-1234, liguem']) {
      expect(await editar(pauta.id, owner.id, 'descricao', texto)).toEqual({
        editada: false,
        motivo: 'dado_pessoal',
      });
    }
    expect(await pedidosPendentesDaPauta(db, pauta.id)).toEqual([]);
  });

  it('a lista do bot inclui as publicadas e deixa de fora as recusadas', async () => {
    const publicada = await pautaComOwner('juntando_apoios');
    const recusada = await pautaComOwner('recusada');
    const ids = (dono: string) => pautasEditaveisDoOwner(db, dono).then((l) => l.map((p) => p.id));

    expect(await ids(publicada.owner.id)).toEqual([publicada.pauta.id]);
    expect(await ids(recusada.owner.id)).toEqual([]);
  });
});

describe('decidirPedidoDeEdicao', () => {
  async function comPedido(campo: 'titulo' | 'descricao' = 'titulo') {
    const { pauta, owner } = await pautaComOwner('juntando_apoios');
    await editar(pauta.id, owner.id, campo, 'Texto novo e melhor');
    const [pedido] = await pedidosPendentesDaPauta(db, pauta.id);
    if (pedido === undefined) throw new Error('sem pedido');
    return { pauta, owner, pedido };
  }
  const decidir = (
    pedidoId: string,
    decisao: { decisao: 'aprovado'; depoisVisto: string } | { decisao: 'recusado'; motivo: string },
    agora?: Date,
  ) =>
    db.transaction((tx) =>
      decidirPedidoDeEdicao(tx, {
        pedidoId,
        curadorId,
        ...decisao,
        ...(agora === undefined ? {} : { agora }),
      }),
    );
  const avisosDe = (pedidoId: string) =>
    db.select().from(disparos).where(eq(disparos.aviso, pedidoId));

  it('aprovar troca o texto público, registra o evento e avisa quem pediu', async () => {
    const { pauta, owner, pedido } = await comPedido('titulo');
    const agora = new Date('2030-01-02T12:00:00.000Z');

    expect(
      await decidir(pedido.id, { decisao: 'aprovado', depoisVisto: 'Texto novo e melhor' }, agora),
    ).toEqual({ decidido: true });

    expect((await pautaDa(pauta.id))?.titulo).toBe('Texto novo e melhor');
    expect(await pedidosPendentesDaPauta(db, pauta.id)).toEqual([]);
    const [linha] = await db.select().from(pedidosEdicao).where(eq(pedidosEdicao.id, pedido.id));
    expect(linha).toMatchObject({
      status: 'aprovado',
      decididoEm: agora,
      decididoPor: curadorId,
      motivoRecusa: null,
    });
    const evento = (await db.select().from(eventos).where(eq(eventos.pautaId, pauta.id))).filter(
      (e) => e.tipo === 'pauta_editada',
    );
    expect(evento).toMatchObject([
      {
        dados: { campo: 'titulo', antes: 'Bebedouro quebrado', depois: 'Texto novo e melhor' },
        origem: 'curadoria',
        publico: false,
      },
    ]);
    expect(await avisosDe(pedido.id)).toMatchObject([
      {
        tipo: 'edicao_decidida',
        estudanteId: owner.id,
        modelo: 'lumens_edicao_aprovada',
        parametros: ['título', 'Texto novo e melhor', pauta.slug],
      },
    ]);
  });

  it('recusar exige motivo, mantém o texto público e avisa com o motivo', async () => {
    const { pauta, owner, pedido } = await comPedido('descricao');

    for (const motivo of ['', '  ', 'x'.repeat(201)]) {
      expect(await decidir(pedido.id, { decisao: 'recusado', motivo })).toEqual({
        decidido: false,
        motivo: 'motivo_invalido',
      });
    }
    expect(await pedidosPendentesDaPauta(db, pauta.id)).toHaveLength(1);

    expect(await decidir(pedido.id, { decisao: 'recusado', motivo: ' Muda o sentido. ' })).toEqual({
      decidido: true,
    });

    expect((await pautaDa(pauta.id))?.descricao).toBe('Não funciona há duas semanas.');
    expect(await avisosDe(pedido.id)).toMatchObject([
      {
        estudanteId: owner.id,
        modelo: 'lumens_edicao_recusada',
        parametros: ['descrição', 'Bebedouro quebrado', 'Muda o sentido.', pauta.slug],
      },
    ]);
    // A recusa não deixa evento: o texto público não mudou.
    const eventosDaPauta = await db.select().from(eventos).where(eq(eventos.pautaId, pauta.id));
    expect(eventosDaPauta.filter((e) => e.tipo === 'pauta_editada')).toEqual([]);
  });

  it('só aprova o que a curadoria viu: depois diferente ou antes que mudou não passam', async () => {
    const { pauta, pedido } = await comPedido('titulo');

    expect(await decidir(pedido.id, { decisao: 'aprovado', depoisVisto: 'Outro texto' })).toEqual({
      decidido: false,
      motivo: 'pedido_mudou',
    });
    await db.update(pautas).set({ titulo: 'Mudou por fora' }).where(eq(pautas.id, pauta.id));
    expect(
      await decidir(pedido.id, { decisao: 'aprovado', depoisVisto: 'Texto novo e melhor' }),
    ).toEqual({ decidido: false, motivo: 'pedido_mudou' });
    expect((await pautaDa(pauta.id))?.titulo).toBe('Mudou por fora');
    expect(await avisosDe(pedido.id)).toEqual([]);
  });

  it('a fila traz os achados do texto novo, para a curadoria conferir', async () => {
    const { pauta, owner } = await pautaComOwner('juntando_apoios');
    await editar(pauta.id, owner.id, 'descricao', 'A professora Marta mandou trocar o filtro.');

    const [pedido] = await pedidosPendentesDaPauta(db, pauta.id);
    expect(pedido?.achados).toMatchObject([
      { severidade: 'aviso', motivo: 'possivel_nome', trecho: 'professora Marta' },
    ]);
    const fila = await listarPedidosDeEdicaoPendentes(db);
    expect(fila.find((p) => p.id === pedido?.id)?.achados).toHaveLength(1);
  });

  it('aprovar não publica texto com dado pessoal, mesmo que ele tenha entrado por fora', async () => {
    const { pauta, pedido } = await comPedido('descricao');
    await db
      .update(pedidosEdicao)
      .set({ depois: 'Chame no zap (82) 99999-1234' })
      .where(eq(pedidosEdicao.id, pedido.id));

    expect(
      await decidir(pedido.id, {
        decisao: 'aprovado',
        depoisVisto: 'Chame no zap (82) 99999-1234',
      }),
    ).toEqual({ decidido: false, motivo: 'dado_pessoal' });
    expect((await pautaDa(pauta.id))?.descricao).toBe('Não funciona há duas semanas.');
    expect(await avisosDe(pedido.id)).toEqual([]);
    // A recusa continua possível.
    expect(await decidir(pedido.id, { decisao: 'recusado', motivo: 'Tem telefone.' })).toEqual({
      decidido: true,
    });
  });

  it('pedido já decidido ou inexistente não muda nada', async () => {
    const { pedido } = await comPedido('titulo');
    await decidir(pedido.id, { decisao: 'recusado', motivo: 'Não.' });

    expect(await decidir(pedido.id, { decisao: 'recusado', motivo: 'De novo.' })).toEqual({
      decidido: false,
      motivo: 'ja_decidido',
    });
    expect(await avisosDe(pedido.id)).toHaveLength(1);
    expect(
      await decidir('00000000-0000-0000-0000-000000000000', {
        decisao: 'recusado',
        motivo: 'x',
      }),
    ).toEqual({ decidido: false, motivo: 'pedido_inexistente' });
  });

  it('depois de decidido, o autor pode pedir de novo; a fila só tem os pendentes', async () => {
    const { pauta, owner, pedido } = await comPedido('titulo');
    await decidir(pedido.id, { decisao: 'recusado', motivo: 'Não.' });

    expect(await editar(pauta.id, owner.id, 'titulo', 'Terceira tentativa')).toEqual({
      editada: true,
      modo: 'pedido',
    });
    const fila = await listarPedidosDeEdicaoPendentes(db);
    expect(fila.filter((p) => p.pautaId === pauta.id)).toMatchObject([
      { depois: 'Terceira tentativa', pautaTitulo: 'Bebedouro quebrado' },
    ]);
  });
});
