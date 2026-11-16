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
import { aprovarRelato, recusarRelato } from './moderacao';
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
}

/** A pauta como a curadoria vê na tela dela (SCRUM-168), em qualquer status. */
export interface PautaDaCuradoria extends PautaNaFila {
  status: StatusPauta;
  /** Só em pauta recusada. */
  motivoRecusa: string | null;
}

function lerPautas(db: Db, filtro: SQL, agora: Date): Promise<PautaDaCuradoria[]> {
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
      criadaEm: pautas.criadaEm,
      status: pautas.status,
      motivoRecusa: pautas.motivoRecusa,
    })
    .from(pautas)
    .leftJoin(blocos, eq(blocos.id, pautas.blocoId))
    .where(filtro)
    .orderBy(pautas.criadaEm)
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
export function listarPautasDaCuradoria(
  db: Db,
  agora = new Date(),
  filtro: { status?: StatusPauta; q?: string } = {},
): Promise<PautaDaCuradoria[]> {
  const condicoes: SQL[] = [];
  if (filtro.status !== undefined) condicoes.push(eq(pautas.status, filtro.status));
  if (filtro.q !== undefined && filtro.q.trim() !== '') {
    condicoes.push(sql`${pautas.titulo} ilike ${`%${filtro.q.trim()}%`}`);
  }
  const filtroSQL = condicoes.length === 0 ? sql`true` : (and(...condicoes) ?? sql`true`);
  return lerPautas(db, filtroSQL, agora);
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
      .where(
        and(
          eq(pautas.status, 'cobrando'),
          sql`not exists (
            select 1 from ${documentosResposta}
            where ${documentosResposta.pautaId} = ${pautas.id}
          )`,
        ),
      ),
    db
      .select({ total: sql<number>`count(distinct ${promessas.pautaId})::int` })
      .from(promessas)
      .where(
        and(
          sql`${promessas.conferenciaAbreEm} <= ${agora.toISOString()}::timestamptz`,
          sql`${promessas.conferenciaFechaEm} > ${agora.toISOString()}::timestamptz`,
          sql`${promessas.resultado} is null`,
        ),
      ),
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

export type ResultadoDecisao =
  | { decidida: true }
  | {
      decidida: false;
      motivo: 'pauta_inexistente' | 'ja_decidida' | 'motivo_obrigatorio' | 'categoria_invalida';
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
 * Aprova: a pauta vai para `juntando_apoios` e passa a aparecer no site. Os responsáveis são
 * avisados pela fila de envio, na mesma transação: se a aprovação não for gravada, ninguém é
 * avisado.
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
  const resultado = await decidir(tx, pautaId, curadorId, 'juntando_apoios', undefined, agora);
  if (resultado.decidida) {
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
    const relatosDeOrigem = await tx
      .select({ id: relatos.id })
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
    for (const relato of relatosDeOrigem) {
      await aprovarRelato(tx, { relatoId: relato.id, curadorId, agora });
    }
    await enfileirarAvisoDeAprovacao(tx, { pautaId, agora });
  }
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
    .select({ status: pautas.status, urgente: pautas.urgente })
    .from(pautas)
    .where(eq(pautas.id, pautaId))
    .for('update');
  if (pauta === undefined) return { atualizada: false, motivo: 'pauta_inexistente' };
  if (pauta.status === 'em_curadoria' || pauta.status === 'recusada') {
    return { atualizada: false, motivo: 'pauta_nao_publica' };
  }
  if (pauta.urgente === urgente) return { atualizada: true };
  const motivoLimpo = motivo?.trim();

  await tx
    .update(pautas)
    .set({
      urgente,
      urgenteDesde: urgente ? agora : null,
      urgentePor: urgente ? curadorId : null,
    })
    .where(eq(pautas.id, pautaId));
  await registrarEvento(tx, {
    pautaId,
    tipo: 'pauta_urgente',
    dados: motivoLimpo ? { urgente, motivo: motivoLimpo } : { urgente },
    origem: 'curadoria',
  });
  return { atualizada: true };
}

export async function definirCategoria(
  tx: Tx,
  { pautaId, categoria }: { pautaId: string; categoria: string },
): Promise<boolean> {
  if (!Object.hasOwn(CATEGORIAS, categoria)) return false;
  const resultado = await tx
    .update(pautas)
    .set({ categoria })
    .where(and(eq(pautas.id, pautaId), sql`${pautas.status} not in ('em_curadoria', 'recusada')`))
    .returning({ id: pautas.id });
  return resultado.length > 0;
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

  const relatosDeOrigem = await tx
    .select({ id: relatos.id })
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
  for (const relato of relatosDeOrigem) {
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
