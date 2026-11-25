/**
 * SCRUM-401 · Aviso de alteração da pauta pela curadoria.
 *
 * O princípio do projeto é transparência em todos os atos para quem é afetado. Meta, bloco,
 * categoria e urgência já iam para a linha do tempo; aqui quem cuida da pauta (e, quando a meta
 * muda, quem apoiou) também recebe, pelo bot, o que mudou, de quê para quê e o motivo.
 *
 * Quem recebe: owners e co-owners ativos e, para meta e bloco, quem já apoiou (a meta deles mudou).
 * Nunca quem saiu do Lumens. O aviso leva o título da pauta, a mudança e o motivo digitado pela
 * curadoria; nunca o nome de quem decidiu. A chave de idempotência é o id do evento da alteração:
 * repetir a chamada não manda duas vezes, e duas alterações seguidas mandam dois avisos.
 */
import { CATEGORIAS } from '@lumens/contratos';
import { and, apoios, eq, estudantes, isNull, papeisPauta, pautas, type Tx } from '@lumens/db';
import { enfileirarDisparos } from './fila';

/** Mensagem modelo: título da pauta, o que mudou, o motivo e, no botão, o slug. */
export const MODELO_PAUTA_ALTERADA = 'lumens_pauta_alterada';

/**
 * A mesma mensagem sem o botão "Ver a pauta", para pauta que ainda não está no site (em curadoria):
 * a página dela devolve 404 até a aprovação, então o link só enganaria.
 */
export const MODELO_PAUTA_ALTERADA_SEM_LINK = 'lumens_pauta_alterada_sem_link';

/** Status em que a pauta ainda não tem página pública. */
const SEM_PAGINA: readonly string[] = ['em_curadoria', 'recusada'];

export type AlteracaoDaPauta =
  | { tipo: 'meta'; metaAntes: number; metaDepois: number }
  | {
      tipo: 'bloco';
      blocoAntes: string | null;
      blocoDepois: string | null;
      metaAntes: number;
      metaDepois: number;
    }
  | { tipo: 'categoria'; de: string; para: string }
  | { tipo: 'urgencia'; urgente: boolean };

const rotuloDeCategoria = (chave: string): string =>
  Object.hasOwn(CATEGORIAS, chave) ? CATEGORIAS[chave as keyof typeof CATEGORIAS] : chave;

const local = (bloco: string | null): string => bloco ?? 'todo o campus';

/** A frase que vai no modelo, no lugar de `{{2}}`. */
export function textoDaAlteracao(alteracao: AlteracaoDaPauta): string {
  switch (alteracao.tipo) {
    case 'meta':
      return `a meta passou de ${String(alteracao.metaAntes)} para ${String(alteracao.metaDepois)} apoios`;
    case 'bloco':
      return (
        `o bloco passou de ${local(alteracao.blocoAntes)} para ${local(alteracao.blocoDepois)} e a meta, ` +
        `de ${String(alteracao.metaAntes)} para ${String(alteracao.metaDepois)} apoios`
      );
    case 'categoria':
      return `a categoria passou de ${rotuloDeCategoria(alteracao.de)} para ${rotuloDeCategoria(alteracao.para)}`;
    case 'urgencia':
      return alteracao.urgente ? 'ela foi marcada como urgente' : 'ela deixou de ser urgente';
  }
}

/** Categoria e urgência não têm motivo digitado: o aviso diz isso em vez de inventar um. */
export const MOTIVO_SEM_TEXTO = 'decisão da curadoria, sem motivo digitado';

/**
 * Enfileira o aviso de uma alteração. `eventoId` é o do evento que a registrou na linha do tempo.
 * Devolve quantas pessoas entraram na fila.
 */
export async function enfileirarAvisoDeAlteracao(
  tx: Tx,
  {
    pautaId,
    eventoId,
    alteracao,
    motivo,
    agora = new Date(),
  }: {
    pautaId: string;
    eventoId: string;
    alteracao: AlteracaoDaPauta;
    motivo?: string;
    agora?: Date;
  },
): Promise<number> {
  const [pauta] = await tx
    .select({ titulo: pautas.titulo, slug: pautas.slug, status: pautas.status })
    .from(pautas)
    .where(eq(pautas.id, pautaId));
  if (pauta === undefined) return 0;

  const responsaveis = await tx
    .select({ estudanteId: papeisPauta.estudanteId })
    .from(papeisPauta)
    .innerJoin(estudantes, eq(estudantes.id, papeisPauta.estudanteId))
    .where(
      and(eq(papeisPauta.pautaId, pautaId), isNull(papeisPauta.ate), isNull(estudantes.saiuEm)),
    );

  const mudaAMeta = alteracao.tipo === 'meta' || alteracao.tipo === 'bloco';
  const apoiadores = mudaAMeta
    ? await tx
        .select({ estudanteId: apoios.estudanteId })
        .from(apoios)
        .innerJoin(estudantes, eq(estudantes.id, apoios.estudanteId))
        .where(and(eq(apoios.pautaId, pautaId), isNull(estudantes.saiuEm)))
    : [];

  const destinatarios = new Set([...responsaveis, ...apoiadores].map((d) => d.estudanteId));
  const motivoLimpo = motivo?.trim();
  const publica = !SEM_PAGINA.includes(pauta.status);
  const parametros = [
    pauta.titulo,
    textoDaAlteracao(alteracao),
    motivoLimpo ? motivoLimpo : MOTIVO_SEM_TEXTO,
    ...(publica ? [pauta.slug] : []),
  ];
  return enfileirarDisparos(
    tx,
    [...destinatarios].map((estudanteId) => ({
      tipo: 'alteracao' as const,
      aviso: eventoId,
      estudanteId,
      modelo: publica ? MODELO_PAUTA_ALTERADA : MODELO_PAUTA_ALTERADA_SEM_LINK,
      parametros,
    })),
    agora,
  );
}
