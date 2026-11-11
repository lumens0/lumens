/**
 * Moderação de relatos e fotos (5.3, RN12): a fila do que espera decisão e as duas decisões.
 *
 * O relato nasce `pendente` e só o aprovado chega ao site (`v_relato_publico`). A foto é do
 * relato: a decisão vale para os dois juntos.
 */
import { and, blocos, eq, pautas, relatos, sql, type Db, type Tx } from '@lumens/db';
import { conferirAnonimato, type Achado } from './anonimato';
import { registrarEvento } from './eventos';

export interface RelatoPendente {
  id: string;
  texto: string;
  fotoChave: string | null;
  /**
   * Lembrete do que barrar: e-mail, telefone e matrícula (`bloqueio`) e possível nome (`aviso`)
   * achados no texto. É ajuda para quem lê, não filtro: ofensa e o que está na foto só a pessoa vê.
   */
  achados: Achado[];
}

export interface PautaComRelatosPendentes {
  id: string;
  titulo: string;
  /** `null` é pauta do campus inteiro. */
  bloco: string | null;
  relatos: RelatoPendente[];
}

/**
 * Relatos pendentes agrupados por pauta, da pauta mais antiga para a mais nova. Pauta recusada
 * fica de fora: nada dela vai ao site.
 */
export async function listarRelatosPendentes(db: Db): Promise<PautaComRelatosPendentes[]> {
  const linhas = await db
    .select({
      pautaId: pautas.id,
      titulo: pautas.titulo,
      bloco: blocos.nome,
      id: relatos.id,
      texto: relatos.texto,
      fotoChave: relatos.fotoChave,
    })
    .from(relatos)
    .innerJoin(pautas, eq(pautas.id, relatos.pautaId))
    .leftJoin(blocos, eq(blocos.id, pautas.blocoId))
    .where(and(eq(relatos.moderacao, 'pendente'), sql`${pautas.status} <> 'recusada'`))
    // `relato` não guarda data: dentro da pauta a ordem é pelo id, só para não mudar entre leituras.
    .orderBy(pautas.criadaEm, pautas.id, relatos.id);

  const fila: PautaComRelatosPendentes[] = [];
  for (const { pautaId, titulo, bloco, ...relato } of linhas) {
    let grupo = fila.at(-1);
    if (grupo?.id !== pautaId) {
      grupo = { id: pautaId, titulo, bloco, relatos: [] };
      fila.push(grupo);
    }
    grupo.relatos.push({ ...relato, achados: conferirAnonimato(relato.texto).achados });
  }
  return fila;
}

export type ResultadoModeracao =
  { moderado: true } | { moderado: false; motivo: 'relato_inexistente' | 'ja_moderado' };

export interface DecisaoDeModeracao {
  relatoId: string;
  /** Quem decidiu. Ainda não é gravado: entra junto com a coluna `relato.moderado_por`. */
  curadorId: string;
  agora?: Date;
}

async function moderar(
  tx: Tx,
  { relatoId, agora = new Date() }: DecisaoDeModeracao,
  para: 'aprovado' | 'recusado',
): Promise<ResultadoModeracao> {
  // FOR UPDATE: duas pessoas da curadoria clicando ao mesmo tempo; a segunda vê o relato já moderado.
  const [relato] = await tx
    .select({ pautaId: relatos.pautaId, moderacao: relatos.moderacao })
    .from(relatos)
    .where(eq(relatos.id, relatoId))
    .for('update');

  if (relato === undefined) return { moderado: false, motivo: 'relato_inexistente' };
  if (relato.moderacao !== 'pendente') return { moderado: false, motivo: 'ja_moderado' };

  await tx
    .update(relatos)
    .set({ moderacao: para, moderadoEm: agora })
    .where(eq(relatos.id, relatoId));
  // O catálogo só tem evento para a aprovação; a recusa fica no próprio relato, fora do site.
  if (para === 'aprovado') {
    await registrarEvento(tx, {
      pautaId: relato.pautaId,
      tipo: 'relato_aprovado',
      dados: { relato_id: relatoId },
      origem: 'curadoria',
    });
  }
  return { moderado: true };
}

/** Aprova: o relato (com a foto) passa a aparecer no site, se a pauta dele for pública. */
export function aprovarRelato(tx: Tx, decisao: DecisaoDeModeracao): Promise<ResultadoModeracao> {
  return moderar(tx, decisao, 'aprovado');
}

/** Recusa: o relato nunca vai ao site. Não há aviso a quem relatou nem evento na linha do tempo. */
export function recusarRelato(tx: Tx, decisao: DecisaoDeModeracao): Promise<ResultadoModeracao> {
  return moderar(tx, decisao, 'recusado');
}
