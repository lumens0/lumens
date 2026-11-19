/**
 * Edição de título ou descrição depois da publicação, por pedido aprovado.
 *
 * Em curadoria, o owner corrige direto (`editarPautaEmCuradoria`): o texto novo é o que a curadoria
 * vai avaliar. Publicada a pauta, mudar o texto pularia a moderação, então a edição vira um pedido
 * pendente. A curadoria vê o antes e o depois no painel e aprova ou recusa (a recusa leva motivo);
 * só então o texto público muda. Quem pediu recebe a decisão no bot (aviso `edicao_decidida`).
 *
 * No máximo um pedido pendente por pauta e campo (índice único parcial): enquanto a curadoria não
 * decide, um segundo pedido do mesmo campo volta como `pedido_pendente`.
 */
import {
  and,
  eq,
  estudantes,
  isNull,
  papeisPauta,
  pautas,
  pedidosEdicao,
  sql,
  type Db,
  type Tx,
} from '@lumens/db';
import { enfileirarDisparos } from '../avisos/fila';
import { conferirAnonimato, type Achado } from '../compartilhado/anonimato';
import { registrarEvento } from '../compartilhado/eventos';
import { MOTIVO_MAXIMO, motivoValido } from '../compartilhado/motivo';
import { editarPautaEmCuradoria, type CampoEditavel, type ResultadoEdicao } from './edicao';
import { DESCRICAO_MAXIMA, TITULO_MAXIMO } from './pauta';

/**
 * Mensagens modelo (WhatsApp oficial): o campo e o título da pauta, o motivo na recusa e, por último,
 * o slug do botão "Ver a pauta".
 */
export const MODELO_EDICAO_APROVADA = 'lumens_edicao_aprovada';
export const MODELO_EDICAO_RECUSADA = 'lumens_edicao_recusada';

/** Teto do motivo de recusa, o mesmo da recusa de foto. */
export const MOTIVO_DE_EDICAO_MAXIMO = MOTIVO_MAXIMO;

const temBloqueio = (texto: string) =>
  conferirAnonimato(texto).achados.some((a) => a.severidade === 'bloqueio');

const NOME_DO_CAMPO: Record<CampoEditavel, string> = { titulo: 'título', descricao: 'descrição' };
const tamanho = (texto: string) => Array.from(texto).length;

export type ResultadoEditarPauta =
  | { editada: true; modo: 'direta' | 'pedido' | 'sem_mudanca' }
  | {
      editada: false;
      motivo:
        Extract<ResultadoEdicao, { editada: false }>['motivo'] | 'pedido_pendente' | 'dado_pessoal';
    };

/**
 * Ponto de entrada do bot: em curadoria muda o texto direto; publicada, registra o pedido para a
 * curadoria. Confere tudo na transação (a pauta muda entre uma mensagem e outra).
 */
export async function editarPauta(
  tx: Tx,
  args: { pautaId: string; estudanteId: string; campo: CampoEditavel; texto: string },
): Promise<ResultadoEditarPauta> {
  // FOR UPDATE: decisão da curadoria e esta edição não correm juntas.
  const [pauta] = await tx
    .select({ status: pautas.status, titulo: pautas.titulo, descricao: pautas.descricao })
    .from(pautas)
    .where(eq(pautas.id, args.pautaId))
    .for('update');
  if (pauta === undefined || pauta.status === 'recusada') {
    return { editada: false, motivo: 'pauta_fechada' };
  }
  if (pauta.status === 'em_curadoria') {
    const r = await editarPautaEmCuradoria(tx, args);
    return r.editada ? { editada: true, modo: 'direta' } : r;
  }

  const limpo = args.texto.trim();
  if (limpo === '') return { editada: false, motivo: 'texto_vazio' };
  const maximo = args.campo === 'titulo' ? TITULO_MAXIMO : DESCRICAO_MAXIMA;
  if (tamanho(limpo) > maximo) return { editada: false, motivo: 'texto_longo' };
  // O texto novo vai ao site se a curadoria aprovar: e-mail, telefone ou matrícula nem chegam a ela.
  if (temBloqueio(limpo)) return { editada: false, motivo: 'dado_pessoal' };

  const [papel] = await tx
    .select({ id: papeisPauta.estudanteId })
    .from(papeisPauta)
    .where(
      and(
        eq(papeisPauta.pautaId, args.pautaId),
        eq(papeisPauta.estudanteId, args.estudanteId),
        eq(papeisPauta.papel, 'owner'),
        isNull(papeisPauta.ate),
      ),
    );
  if (papel === undefined) return { editada: false, motivo: 'nao_e_owner' };

  const antes = args.campo === 'titulo' ? pauta.titulo : pauta.descricao;
  if (antes === limpo) return { editada: true, modo: 'sem_mudanca' };

  const [pendente] = await tx
    .select({ id: pedidosEdicao.id })
    .from(pedidosEdicao)
    .where(
      and(
        eq(pedidosEdicao.pautaId, args.pautaId),
        eq(pedidosEdicao.campo, args.campo),
        eq(pedidosEdicao.status, 'pendente'),
      ),
    );
  if (pendente !== undefined) return { editada: false, motivo: 'pedido_pendente' };

  await tx.insert(pedidosEdicao).values({
    pautaId: args.pautaId,
    estudanteId: args.estudanteId,
    campo: args.campo,
    antes,
    depois: limpo,
  });
  return { editada: true, modo: 'pedido' };
}

export interface PedidoDeEdicao {
  id: string;
  pautaId: string;
  campo: CampoEditavel;
  antes: string;
  depois: string;
  criadoEm: Date;
  /** Lembrete do que barrar no texto novo (e-mail, telefone, matrícula, possível nome). */
  achados: Achado[];
}

export interface PedidoDeEdicaoNaFila extends PedidoDeEdicao {
  pautaTitulo: string;
}

const comAchados = <T extends { depois: string }>(linhas: T[]) =>
  linhas.map((l) => ({ ...l, achados: conferirAnonimato(l.depois).achados }));

const colunas = {
  id: pedidosEdicao.id,
  pautaId: pedidosEdicao.pautaId,
  campo: sql<CampoEditavel>`${pedidosEdicao.campo}`,
  antes: pedidosEdicao.antes,
  depois: pedidosEdicao.depois,
  criadoEm: pedidosEdicao.criadoEm,
};

/** Pedidos pendentes de uma pauta, o mais antigo primeiro. */
export async function pedidosPendentesDaPauta(db: Db, pautaId: string): Promise<PedidoDeEdicao[]> {
  return comAchados(
    await db
      .select(colunas)
      .from(pedidosEdicao)
      .where(and(eq(pedidosEdicao.pautaId, pautaId), eq(pedidosEdicao.status, 'pendente')))
      .orderBy(pedidosEdicao.criadoEm, pedidosEdicao.id),
  );
}

/** Fila da curadoria: todos os pedidos pendentes, do mais antigo para o mais novo. */
export async function listarPedidosDeEdicaoPendentes(db: Db): Promise<PedidoDeEdicaoNaFila[]> {
  return comAchados(
    await db
      .select({ ...colunas, pautaTitulo: pautas.titulo })
      .from(pedidosEdicao)
      .innerJoin(pautas, eq(pautas.id, pedidosEdicao.pautaId))
      .where(eq(pedidosEdicao.status, 'pendente'))
      .orderBy(pedidosEdicao.criadoEm, pedidosEdicao.id),
  );
}

export type ResultadoDecisaoDePedido =
  | { decidido: true }
  | {
      decidido: false;
      motivo:
        'pedido_inexistente' | 'ja_decidido' | 'pedido_mudou' | 'motivo_invalido' | 'dado_pessoal';
    };

export type DecisaoDePedido =
  | {
      decisao: 'aprovado';
      /** O texto novo que a tela mostrou: se o pedido não for mais esse, nada muda. */
      depoisVisto: string;
    }
  | { decisao: 'recusado'; motivo: string };

/**
 * Aprova (o texto público muda) ou recusa (com motivo) um pedido pendente, e avisa quem pediu na
 * mesma transação. Aprovar só vale para o que a curadoria viu: o depois da tela e o texto atual da
 * pauta (o antes) precisam ser os do pedido.
 */
export async function decidirPedidoDeEdicao(
  tx: Tx,
  {
    pedidoId,
    curadorId,
    agora = new Date(),
    ...decisao
  }: { pedidoId: string; curadorId: string; agora?: Date } & DecisaoDePedido,
): Promise<ResultadoDecisaoDePedido> {
  const motivo = decisao.decisao === 'recusado' ? motivoValido(decisao.motivo) : '';
  if (motivo === undefined) return { decidido: false, motivo: 'motivo_invalido' };

  const [achado] = await tx
    .select({ pautaId: pedidosEdicao.pautaId })
    .from(pedidosEdicao)
    .where(eq(pedidosEdicao.id, pedidoId));
  if (achado === undefined) return { decidido: false, motivo: 'pedido_inexistente' };
  // Pauta antes do pedido, como em `editarPauta`: sem deadlock entre pedido e decisão.
  const [pauta] = await tx
    .select({ titulo: pautas.titulo, descricao: pautas.descricao, slug: pautas.slug })
    .from(pautas)
    .where(eq(pautas.id, achado.pautaId))
    .for('update');
  const [pedido] = await tx
    .select({
      estudanteId: pedidosEdicao.estudanteId,
      campo: sql<CampoEditavel>`${pedidosEdicao.campo}`,
      antes: pedidosEdicao.antes,
      depois: pedidosEdicao.depois,
      status: pedidosEdicao.status,
    })
    .from(pedidosEdicao)
    .where(eq(pedidosEdicao.id, pedidoId))
    .for('update');
  if (pauta === undefined || pedido === undefined) {
    return { decidido: false, motivo: 'pedido_inexistente' };
  }
  if (pedido.status !== 'pendente') return { decidido: false, motivo: 'ja_decidido' };

  const atual = pedido.campo === 'titulo' ? pauta.titulo : pauta.descricao;
  if (
    decisao.decisao === 'aprovado' &&
    (decisao.depoisVisto !== pedido.depois || atual !== pedido.antes)
  ) {
    return { decidido: false, motivo: 'pedido_mudou' };
  }
  // Defesa em profundidade: o pedido já foi barrado ao ser feito, mas o texto vai ao site daqui.
  if (decisao.decisao === 'aprovado' && temBloqueio(pedido.depois)) {
    return { decidido: false, motivo: 'dado_pessoal' };
  }

  await tx
    .update(pedidosEdicao)
    .set({
      status: decisao.decisao,
      motivoRecusa: decisao.decisao === 'recusado' ? motivo : null,
      decididoEm: agora,
      decididoPor: curadorId,
    })
    .where(eq(pedidosEdicao.id, pedidoId));

  let tituloDaPauta = pauta.titulo;
  if (decisao.decisao === 'aprovado') {
    await tx
      .update(pautas)
      .set(pedido.campo === 'titulo' ? { titulo: pedido.depois } : { descricao: pedido.depois })
      .where(eq(pautas.id, achado.pautaId));
    if (pedido.campo === 'titulo') tituloDaPauta = pedido.depois;
    await registrarEvento(tx, {
      pautaId: achado.pautaId,
      tipo: 'pauta_editada',
      dados: { campo: pedido.campo, antes: pedido.antes, depois: pedido.depois },
      origem: 'curadoria',
    });
  }

  // Quem saiu do Lumens não recebe aviso: o pedido já foi decidido e fica registrado.
  const [pessoa] = await tx
    .select({ id: estudantes.id })
    .from(estudantes)
    .where(and(eq(estudantes.id, pedido.estudanteId), isNull(estudantes.saiuEm)));
  if (pessoa !== undefined) {
    const campo = NOME_DO_CAMPO[pedido.campo];
    await enfileirarDisparos(
      tx,
      [
        {
          tipo: 'edicao_decidida',
          aviso: pedidoId,
          estudanteId: pedido.estudanteId,
          ...(decisao.decisao === 'aprovado'
            ? { modelo: MODELO_EDICAO_APROVADA, parametros: [campo, tituloDaPauta, pauta.slug] }
            : {
                modelo: MODELO_EDICAO_RECUSADA,
                parametros: [campo, tituloDaPauta, motivo, pauta.slug],
              }),
        },
      ],
      agora,
    );
  }
  return { decidido: true };
}
