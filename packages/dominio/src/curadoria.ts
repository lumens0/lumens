/**
 * Curadoria de pautas novas (5.2): a fila do que espera decisão e as duas decisões possíveis.
 *
 * Aprovar e recusar passam por `transicionarStatus`; aqui ficam a recusa de quem chega atrasado
 * (outra pessoa da curadoria já decidiu) e o evento próprio de cada decisão.
 */
import {
  and,
  blocos,
  eq,
  estudantes,
  isNull,
  papeisPauta,
  pautas,
  relatos,
  sql,
  type Db,
  type Tx,
} from '@lumens/db';
import { registrarEvento } from './eventos';
import { enfileirarDisparos } from './fila';
import { transicionarStatus } from './status';

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
}

/** Pautas em curadoria, da mais antiga (prazo mais perto) para a mais nova. */
export async function listarFilaDeCuradoria(db: Db, agora = new Date()): Promise<PautaNaFila[]> {
  const linhas = await db
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
      criadaEm: pautas.criadaEm,
    })
    .from(pautas)
    .leftJoin(blocos, eq(blocos.id, pautas.blocoId))
    .where(eq(pautas.status, 'em_curadoria'))
    .orderBy(pautas.criadaEm);

  return linhas.map((p) => {
    const prazo = new Date(p.criadaEm.getTime() + PRAZO_DE_CURADORIA_MS);
    return { ...p, prazo, restanteMs: prazo.getTime() - agora.getTime() };
  });
}

export type ResultadoDecisao =
  | { decidida: true }
  | { decidida: false; motivo: 'pauta_inexistente' | 'ja_decidida' | 'motivo_obrigatorio' };

async function decidir(
  tx: Tx,
  pautaId: string,
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
  await registrarEvento(tx, {
    pautaId,
    tipo: para === 'recusada' ? 'pauta_recusada' : 'pauta_aprovada',
    dados: {},
    origem: 'curadoria',
  });
  return { decidida: true };
}

/** Aprova: a pauta vai para `juntando_apoios` e passa a aparecer no site. */
export function aprovarPauta(
  tx: Tx,
  { pautaId, agora = new Date() }: { pautaId: string; agora?: Date },
): Promise<ResultadoDecisao> {
  return decidir(tx, pautaId, 'juntando_apoios', undefined, agora);
}

/**
 * Recusa com motivo obrigatório (RF-C02). O motivo fica em `pauta.motivo_recusa`, fora do site, e
 * vai para os responsáveis pela pauta pela fila de envio, na mesma transação: se a recusa não for
 * gravada, ninguém é avisado.
 */
export async function recusarPauta(
  tx: Tx,
  { pautaId, motivo, agora = new Date() }: { pautaId: string; motivo: string; agora?: Date },
): Promise<ResultadoDecisao> {
  const resultado = await decidir(tx, pautaId, 'recusada', motivo, agora);
  if (!resultado.decidida) return resultado;

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
