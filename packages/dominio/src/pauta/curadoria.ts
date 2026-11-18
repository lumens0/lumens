/**
 * Curadoria de pautas novas (5.2): a fila do que espera decisão e as duas decisões possíveis.
 *
 * Aprovar e recusar passam por `transicionarStatus`; aqui ficam a recusa de quem chega atrasado
 * (outra pessoa da curadoria já decidiu) e o evento próprio de cada decisão.
 */
import {
  and,
  apoios,
  blocos,
  documentosResposta,
  eq,
  estudantes,
  isNull,
  papeisPauta,
  pautas,
  promessas,
  relatos,
  sql,
  type Db,
  type SQL,
  type StatusPauta,
  type Tx,
} from '@lumens/db';
import { registrarEvento } from '../compartilhado/eventos';
import { enfileirarAvisoDeAprovacao } from '../avisos/aviso-aprovacao';
import { enfileirarDisparos } from '../avisos/fila';
import { registrarApoio } from './apoio';
import { aprovarRelato, recusarRelato } from './moderacao';
import { conferirAnonimato } from '../compartilhado/anonimato';
import { transicionarStatus } from './status';
import { CATEGORIAS } from './pauta';

/** Mensagem modelo (SCRUM-170): título da pauta e motivo da recusa. */
export const MODELO_PAUTA_RECUSADA = 'lumens_pauta_recusada';

/** Prazo para a curadoria decidir uma pauta nova, contado de quando ela foi criada. */
export const PRAZO_DE_CURADORIA_MS = 24 * 3_600_000;

export interface PautaNaFila {
  id: string;
  titulo: string;
  descricao: string;
  /** `null` é pauta do campus inteiro. */
  bloco: string | null;
  /** Foto do relato que originou a pauta, se houver. */
  fotoChave: string | null;
  criadaEm: Date;
  prazo: Date;
  /** Negativo quando o prazo já passou. */
  restanteMs: number;
  apoios: number;
  meta: number;
  urgente: boolean;
  /** Só para o painel: o evento público e o site não levam o motivo. */
  urgenteMotivo: string | null;
}

/** A pauta como a curadoria vê na tela dela (SCRUM-168), em qualquer status. */
export interface PautaDaCuradoria extends PautaNaFila {
  status: StatusPauta;
  /** Só em pauta recusada. */
  motivoRecusa: string | null;
}

function lerPautas(db: Db, filtro: SQL, agora: Date, limite?: number): Promise<PautaDaCuradoria[]> {
  return db
    .select({
      id: pautas.id,
      titulo: pautas.titulo,
      descricao: pautas.descricao,
      bloco: blocos.nome,
      // O relato de origem é o de quem criou a pauta (o owner): `relato` não guarda data, então
      // "o primeiro" não existe; relatos de outras pessoas que chegaram depois ficam de fora.
      fotoChave: sql<string | null>`(
        select ${relatos.fotoChave} from ${relatos}
        join ${papeisPauta} on ${papeisPauta.pautaId} = ${relatos.pautaId}
          and ${papeisPauta.estudanteId} = ${relatos.estudanteId} and ${papeisPauta.papel} = 'owner'
        where ${relatos.pautaId} = ${pautas.id} and ${relatos.fotoChave} is not null
        limit 1)`,
      apoios: sql<number>`(select count(*)::int from ${apoios} where ${apoios.pautaId} = ${pautas.id})`,
      meta: pautas.meta,
      urgente: pautas.urgente,
      urgenteMotivo: pautas.urgenteMotivo,
      criadaEm: pautas.criadaEm,
      status: pautas.status,
      motivoRecusa: pautas.motivoRecusa,
    })
    .from(pautas)
    .leftJoin(blocos, eq(blocos.id, pautas.blocoId))
    .where(filtro)
    .orderBy(pautas.criadaEm)
    .limit(limite ?? 100_000)
    .then((linhas) =>
      linhas.map((p) => {
        const prazo = new Date(p.criadaEm.getTime() + PRAZO_DE_CURADORIA_MS);
        return { ...p, prazo, restanteMs: prazo.getTime() - agora.getTime() };
      }),
    );
}

/** Pautas em curadoria, da mais antiga (prazo mais perto) para a mais nova. */
export function listarFilaDeCuradoria(db: Db, agora = new Date()): Promise<PautaDaCuradoria[]> {
  return lerPautas(db, eq(pautas.status, 'em_curadoria'), agora);
}

/** Todas as pautas, da mais antiga para a mais nova: a lista geral do painel. */
/** Quantas pautas a lista do painel mostra de uma vez; a tela avisa quando chega nisso. */
export const LIMITE_DA_LISTA = 200;

/** Pendências do início do painel: a contagem e a lista usam o mesmo critério. */
export type PendenciaDaCuradoria = 'sem_resposta_oficial' | 'conferencia_aberta';

const semRespostaOficial = () =>
  and(
    eq(pautas.status, 'cobrando'),
    sql`not exists (
      select 1 from ${documentosResposta}
      where ${documentosResposta.pautaId} = ${pautas.id}
    )`,
  ) ?? sql`false`;

/** Promessa com a janela de conferência aberta agora e ainda sem resultado. */
const promessaEmConferencia = (agora: Date) =>
  and(
    sql`${promessas.conferenciaAbreEm} <= ${agora.toISOString()}::timestamptz`,
    sql`${promessas.conferenciaFechaEm} > ${agora.toISOString()}::timestamptz`,
    sql`${promessas.resultado} is null`,
  ) ?? sql`false`;

/** `%` e `_` (e a própria barra) viram texto na busca, não curinga do `ilike`. */
const textoLiteral = (texto: string) => texto.replace(/[\\%_]/g, (c) => `\\${c}`);

export function listarPautasDaCuradoria(
  db: Db,
  agora = new Date(),
  filtro: { status?: StatusPauta; q?: string; pendencia?: PendenciaDaCuradoria } = {},
): Promise<PautaDaCuradoria[]> {
  const condicoes: SQL[] = [];
  if (filtro.status !== undefined) condicoes.push(eq(pautas.status, filtro.status));
  if (filtro.q !== undefined && filtro.q.trim() !== '') {
    condicoes.push(sql`${pautas.titulo} ilike ${`%${textoLiteral(filtro.q.trim())}%`}`);
  }
  if (filtro.pendencia === 'sem_resposta_oficial') condicoes.push(semRespostaOficial());
  if (filtro.pendencia === 'conferencia_aberta') {
    condicoes.push(
      sql`exists (select 1 from ${promessas} where ${promessas.pautaId} = ${pautas.id} and ${promessaEmConferencia(agora)})`,
    );
  }
  const filtroSQL = condicoes.length === 0 ? sql`true` : (and(...condicoes) ?? sql`true`);
  return lerPautas(db, filtroSQL, agora, LIMITE_DA_LISTA);
}

export interface ResumoDaCuradoria {
  pautasADecidir: number;
  pautasAtrasadas: number;
  relatosAModerar: number;
  pautasSemRespostaOficial: number;
  conferenciasAbertas: number;
}

/** Contagens do trabalho pendente da curadoria, calculadas no instante informado. */
export async function resumoDaCuradoria(db: Db, agora = new Date()): Promise<ResumoDaCuradoria> {
  const [
    pautasADecidir,
    pautasAtrasadas,
    relatosAModerar,
    pautasSemRespostaOficial,
    conferenciasAbertas,
  ] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(pautas)
      .where(eq(pautas.status, 'em_curadoria')),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(pautas)
      .where(
        and(
          eq(pautas.status, 'em_curadoria'),
          sql`${pautas.criadaEm} + interval '24 hours' < ${agora.toISOString()}::timestamptz`,
        ),
      ),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(relatos)
      .innerJoin(pautas, eq(pautas.id, relatos.pautaId))
      .where(
        and(
          eq(relatos.moderacao, 'pendente'),
          sql`${pautas.status} not in ('em_curadoria', 'recusada')`,
        ),
      ),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(pautas)
      .where(semRespostaOficial()),
    db
      .select({ total: sql<number>`count(distinct ${promessas.pautaId})::int` })
      .from(promessas)
      .where(promessaEmConferencia(agora)),
  ]);
  return {
    pautasADecidir: pautasADecidir[0]?.total ?? 0,
    pautasAtrasadas: pautasAtrasadas[0]?.total ?? 0,
    relatosAModerar: relatosAModerar[0]?.total ?? 0,
    pautasSemRespostaOficial: pautasSemRespostaOficial[0]?.total ?? 0,
    conferenciasAbertas: conferenciasAbertas[0]?.total ?? 0,
  };
}

/** Uma pauta pelo id, em qualquer status; `undefined` se não existe. */
export async function buscarPautaDaCuradoria(
  db: Db,
  pautaId: string,
  agora = new Date(),
): Promise<PautaDaCuradoria | undefined> {
  const [pauta] = await lerPautas(db, eq(pautas.id, pautaId), agora);
  return pauta;
}

/** Teto do motivo da recusa, conferido aqui: o `maxLength` do painel não protege a chamada direta. */
export const MOTIVO_RECUSA_MAXIMO = 500;

export type ResultadoDecisao =
  | { decidida: true }
  | {
      decidida: false;
      motivo:
        | 'pauta_inexistente'
        | 'ja_decidida'
        | 'motivo_obrigatorio'
        | 'motivo_longo'
        | 'categoria_invalida'
        | 'relato_com_dado_pessoal';
    };

async function decidir(
  tx: Tx,
  pautaId: string,
  curadorId: string,
  para: 'juntando_apoios' | 'recusada',
  motivo: string | undefined,
  agora: Date,
): Promise<ResultadoDecisao> {
  // FOR UPDATE: duas pessoas da curadoria clicando ao mesmo tempo; a segunda vê a pauta já decidida.
  const [pauta] = await tx
    .select({ status: pautas.status })
    .from(pautas)
    .where(eq(pautas.id, pautaId))
    .for('update');

  if (pauta === undefined) return { decidida: false, motivo: 'pauta_inexistente' };
  if (pauta.status !== 'em_curadoria') return { decidida: false, motivo: 'ja_decidida' };
  if (para === 'recusada' && (motivo?.trim() ?? '') === '') {
    return { decidida: false, motivo: 'motivo_obrigatorio' };
  }
  // Depois das checagens de status: pauta já decidida ou inexistente não pede para resumir o texto.
  if (para === 'recusada' && Array.from(motivo?.trim() ?? '').length > MOTIVO_RECUSA_MAXIMO) {
    return { decidida: false, motivo: 'motivo_longo' };
  }

  await transicionarStatus(tx, { pautaId, para, origem: 'curadoria', motivo, agora });
  // Quem decidiu fica na pauta, não no evento: evento não leva identidade.
  await tx.update(pautas).set({ decididaPor: curadorId }).where(eq(pautas.id, pautaId));
  await registrarEvento(tx, {
    pautaId,
    tipo: para === 'recusada' ? 'pauta_recusada' : 'pauta_aprovada',
    dados: {},
    origem: 'curadoria',
  });
  return { decidida: true };
}

/**
 * Os relatos pendentes de quem criou a pauta (o owner). `relato` não marca qual é o de origem: em
 * pauta ainda em curadoria, só o owner relatou, então são esses.
 */
function relatosDeOrigemPendentes(tx: Tx, pautaId: string) {
  return tx
    .select({ id: relatos.id, texto: relatos.texto, fotoChave: relatos.fotoChave })
    .from(relatos)
    .innerJoin(
      papeisPauta,
      and(
        eq(papeisPauta.pautaId, relatos.pautaId),
        eq(papeisPauta.estudanteId, relatos.estudanteId),
        eq(papeisPauta.papel, 'owner'),
      ),
    )
    .where(and(eq(relatos.pautaId, pautaId), eq(relatos.moderacao, 'pendente')));
}

const temBloqueio = (texto: string) =>
  conferirAnonimato(texto).achados.some((achado) => achado.severidade === 'bloqueio');

/**
 * Recusa só o relato de quem criou a pauta, que ainda está em curadoria (SCRUM-286): o texto tem
 * dado pessoal, mas a pauta pode ser publicada sem ele. A pauta continua esperando a decisão.
 */
export async function recusarRelatoDeOrigem(
  tx: Tx,
  { pautaId, curadorId, agora = new Date() }: { pautaId: string; curadorId: string; agora?: Date },
): Promise<
  { feito: true } | { feito: false; motivo: 'pauta_inexistente' | 'ja_decidida' | 'sem_relato' }
> {
  const [pauta] = await tx
    .select({ status: pautas.status })
    .from(pautas)
    .where(eq(pautas.id, pautaId))
    .for('update');
  if (pauta === undefined) return { feito: false, motivo: 'pauta_inexistente' };
  if (pauta.status !== 'em_curadoria') return { feito: false, motivo: 'ja_decidida' };
  const origem = await relatosDeOrigemPendentes(tx, pautaId);
  if (origem.length === 0) return { feito: false, motivo: 'sem_relato' };
  for (const relato of origem) await recusarRelato(tx, { relatoId: relato.id, curadorId, agora });
  return { feito: true };
}

/**
 * Aprova: a pauta vai para `juntando_apoios` e passa a aparecer no site. Os responsáveis são
 * avisados pela fila de envio, na mesma transação: se a aprovação não for gravada, ninguém é
 * avisado.
 *
 * Quem cuida da pauta conta como o primeiro apoio, também na mesma transação (SCRUM-344). Na
 * aprovação esse é só quem a criou: virar co-owner exige ter apoiado, e apoio só existe depois de
 * aprovada. Sem isto a pauta nascia com 0 apoios, o texto do Fala.BR falava em "0 estudantes"
 * quando o owner protocolava cedo, e quem criou ficava fora do aviso da promessa e da
 * conferência, que vão para quem apoiou.
 */
export async function aprovarPauta(
  tx: Tx,
  {
    pautaId,
    curadorId,
    categoria,
    urgente = false,
    agora = new Date(),
  }: { pautaId: string; curadorId: string; categoria: string; urgente?: boolean; agora?: Date },
): Promise<ResultadoDecisao> {
  if (!categoria || !Object.hasOwn(CATEGORIAS, categoria))
    return { decidida: false, motivo: 'categoria_invalida' };
  // Aprovar publica também o relato de quem criou a pauta. Com e-mail ou telefone nele, a pauta não
  // sai: a curadoria recusa só o relato (`recusarRelatoDeOrigem`) e aprova depois, sem ele.
  const origem = await relatosDeOrigemPendentes(tx, pautaId);
  if (origem.some(({ texto }) => temBloqueio(texto))) {
    return { decidida: false, motivo: 'relato_com_dado_pessoal' };
  }
  const resultado = await decidir(tx, pautaId, curadorId, 'juntando_apoios', undefined, agora);
  if (!resultado.decidida) return resultado;

  await tx
    .update(pautas)
    .set({
      categoria,
      urgente,
      urgenteDesde: urgente ? agora : null,
      urgentePor: urgente ? curadorId : null,
    })
    .where(eq(pautas.id, pautaId));
  if (urgente) {
    await registrarEvento(tx, {
      pautaId,
      tipo: 'pauta_urgente',
      dados: { urgente: true },
      origem: 'curadoria',
    });
  }
  for (const relato of await relatosDeOrigemPendentes(tx, pautaId)) {
    // A foto lida aqui, na mesma transação travada pela decisão da pauta: o relato de origem sai
    // como estava no momento da aprovação (SCRUM-301 exige `fotoVista` em toda aprovação).
    await aprovarRelato(tx, {
      relatoId: relato.id,
      curadorId,
      agora,
      fotoVista: relato.fotoChave,
    });
  }
  const responsaveis = await tx
    .select({ estudanteId: papeisPauta.estudanteId })
    .from(papeisPauta)
    .where(
      and(
        eq(papeisPauta.pautaId, pautaId),
        eq(papeisPauta.papel, 'owner'),
        isNull(papeisPauta.ate),
      ),
    );
  for (const { estudanteId } of responsaveis) {
    // Quem saiu do Lumens enquanto a pauta esperava a curadoria volta recusado, sem erro.
    await registrarApoio(tx, { pautaId, estudanteId, origem: 'bot', agora });
  }
  await enfileirarAvisoDeAprovacao(tx, { pautaId, agora });
  return resultado;
}

export type ResultadoUrgencia =
  | { atualizada: true }
  | { atualizada: false; motivo: 'pauta_inexistente' | 'pauta_nao_publica' | 'motivo_invalido' };

/** Marca ou remove a urgência de uma pauta já pública e registra a mudança na linha do tempo. */
export async function marcarUrgencia(
  tx: Tx,
  {
    pautaId,
    curadorId,
    urgente,
    motivo,
    agora = new Date(),
  }: { pautaId: string; curadorId: string; urgente: boolean; motivo?: string; agora?: Date },
): Promise<ResultadoUrgencia> {
  if (
    motivo !== undefined &&
    (Array.from(motivo.trim()).length > 200 || /[\r\n\u2028\u2029]/u.test(motivo))
  ) {
    return { atualizada: false, motivo: 'motivo_invalido' };
  }
  const [pauta] = await tx
    .select({
      status: pautas.status,
      urgente: pautas.urgente,
      urgenteMotivo: pautas.urgenteMotivo,
    })
    .from(pautas)
    .where(eq(pautas.id, pautaId))
    .for('update');
  if (pauta === undefined) return { atualizada: false, motivo: 'pauta_inexistente' };
  if (pauta.status === 'em_curadoria' || pauta.status === 'recusada') {
    return { atualizada: false, motivo: 'pauta_nao_publica' };
  }
  const motivoLimpo = motivo?.trim();
  const novoMotivo = urgente && motivoLimpo ? motivoLimpo : null;
  if (pauta.urgente === urgente) {
    if (urgente && motivo !== undefined && pauta.urgenteMotivo !== novoMotivo) {
      await tx.update(pautas).set({ urgenteMotivo: novoMotivo }).where(eq(pautas.id, pautaId));
    }
    return { atualizada: true };
  }

  await tx
    .update(pautas)
    .set({
      urgente,
      urgenteDesde: urgente ? agora : null,
      urgentePor: urgente ? curadorId : null,
      // O motivo fica na pauta, só para o painel: o evento é público e vai à linha do tempo do site.
      urgenteMotivo: novoMotivo,
    })
    .where(eq(pautas.id, pautaId));
  await registrarEvento(tx, {
    pautaId,
    tipo: 'pauta_urgente',
    dados: { urgente },
    origem: 'curadoria',
  });
  return { atualizada: true };
}

export type ResultadoCategoria =
  | { feito: true }
  | { feito: false; motivo: 'categoria_invalida' | 'pauta_inexistente' | 'pauta_nao_publicada' };

/**
 * Troca a categoria de pauta já publicada. A troca fica na linha do tempo (`categoria_alterada`),
 * como as outras decisões da curadoria; trocar pela mesma categoria não registra nada.
 */
export async function definirCategoria(
  tx: Tx,
  { pautaId, categoria }: { pautaId: string; categoria: string },
): Promise<ResultadoCategoria> {
  if (!Object.hasOwn(CATEGORIAS, categoria)) return { feito: false, motivo: 'categoria_invalida' };
  const [pauta] = await tx
    .select({ status: pautas.status, categoria: pautas.categoria })
    .from(pautas)
    .where(eq(pautas.id, pautaId))
    .for('update');
  if (pauta === undefined) return { feito: false, motivo: 'pauta_inexistente' };
  if (pauta.status === 'em_curadoria' || pauta.status === 'recusada') {
    return { feito: false, motivo: 'pauta_nao_publicada' };
  }
  if (pauta.categoria === categoria) return { feito: true };
  await tx.update(pautas).set({ categoria }).where(eq(pautas.id, pautaId));
  await registrarEvento(tx, {
    pautaId,
    tipo: 'categoria_alterada',
    dados: { de: pauta.categoria, para: categoria },
    origem: 'curadoria',
  });
  return { feito: true };
}

/**
 * Recusa com motivo obrigatório (RF-C02). O motivo fica em `pauta.motivo_recusa`, fora do site, e
 * vai para os responsáveis pela pauta pela fila de envio, na mesma transação: se a recusa não for
 * gravada, ninguém é avisado.
 */
export async function recusarPauta(
  tx: Tx,
  {
    pautaId,
    curadorId,
    motivo,
    agora = new Date(),
  }: { pautaId: string; curadorId: string; motivo: string; agora?: Date },
): Promise<ResultadoDecisao> {
  const resultado = await decidir(tx, pautaId, curadorId, 'recusada', motivo, agora);
  if (!resultado.decidida) return resultado;

  for (const relato of await relatosDeOrigemPendentes(tx, pautaId)) {
    await recusarRelato(tx, { relatoId: relato.id, curadorId, agora });
  }

  const [pauta] = await tx
    .select({ titulo: pautas.titulo })
    .from(pautas)
    .where(eq(pautas.id, pautaId));
  const responsaveis = await tx
    .select({ estudanteId: papeisPauta.estudanteId })
    .from(papeisPauta)
    .innerJoin(estudantes, eq(estudantes.id, papeisPauta.estudanteId))
    .where(
      and(eq(papeisPauta.pautaId, pautaId), isNull(papeisPauta.ate), isNull(estudantes.saiuEm)),
    );

  const parametros = [pauta?.titulo ?? '', motivo];
  await enfileirarDisparos(
    tx,
    responsaveis.map(({ estudanteId }) => ({
      tipo: 'recusa' as const,
      aviso: pautaId,
      estudanteId,
      modelo: MODELO_PAUTA_RECUSADA,
      parametros,
    })),
    agora,
  );
  return resultado;
}
