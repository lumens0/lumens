/**
 * Aviso coletivo de meta batida (3.2, RF-B11, SCRUM-207).
 *
 * `registrarApoio` marca `pauta.meta_batida_em` quando um apoio cruza a meta (RN05). Este módulo
 * faz o resto: põe na fila de envio um aviso para cada pessoa que apoiava naquele momento, com a
 * mensagem modelo `lumens_meta_batida` (SCRUM-193). Quem manda é o worker da fila, dentro do
 * limite da Meta (RNF06).
 *
 * O gatilho se guia pelo estado — pauta com meta batida e sem aviso na fila —, então não depende
 * de quem chamou `registrarApoio` lembrar de avisar. Quem quiser o aviso na mesma transação do
 * apoio pode chamar `enfileirarAvisoMetaBatida` quando `metaBatidaAgora` vier verdadeiro; o
 * gatilho depois não repete, porque a fila não aceita o mesmo aviso duas vezes.
 */
import {
  and,
  apoios,
  disparos,
  eq,
  estudantes,
  isNull,
  pautas,
  sql,
  type Db,
  type Tx,
} from '@lumens/db';
import { enfileirarDisparos } from './fila';

/** Mensagem modelo (SCRUM-193): título, meta e, no botão "Ver a pauta", o slug. */
export const MODELO_META_BATIDA = 'lumens_meta_batida';

/**
 * Até quando ainda faz sentido avisar. Passado isso, a pauta já está sendo cobrada e o "chegou à
 * meta" virou notícia velha. Também evita que, no primeiro deploy, toda pauta antiga com meta
 * batida dispare de uma vez.
 */
export const PRAZO_DO_AVISO_DE_META_MS = 7 * 24 * 60 * 60_000;

/** Pautas que bateram a meta nos últimos sete dias e ainda não têm aviso na fila. */
export async function pautasComMetaBatidaSemAviso(db: Db | Tx, agora: Date): Promise<string[]> {
  const desde = new Date(agora.getTime() - PRAZO_DO_AVISO_DE_META_MS);
  const linhas = await db
    .select({ id: pautas.id })
    .from(pautas)
    .where(
      and(
        sql`${pautas.metaBatidaEm} > ${desde.toISOString()}::timestamptz`,
        sql`${pautas.metaBatidaEm} <= ${agora.toISOString()}::timestamptz`,
        sql`not exists (select 1 from ${disparos}
          where ${disparos.tipo} = 'meta_batida' and ${disparos.aviso} = ${pautas.id}::text)`,
      ),
    );
  return linhas.map((l) => l.id);
}

/**
 * Enfileira o aviso para quem apoiava a pauta quando ela bateu a meta. Devolve quantos entraram.
 *
 * Quem apoiou depois não recebe: o aviso é "a pauta que você apoiou chegou à meta", e para quem
 * chegou depois ela já tinha chegado. Quem saiu do sistema também não.
 */
export async function enfileirarAvisoMetaBatida(
  tx: Tx,
  { pautaId, agora = new Date() }: { pautaId: string; agora?: Date },
): Promise<number> {
  const [pauta] = await tx
    .select({
      titulo: pautas.titulo,
      slug: pautas.slug,
      meta: pautas.meta,
      metaBatidaEm: pautas.metaBatidaEm,
    })
    .from(pautas)
    .where(eq(pautas.id, pautaId));
  if (pauta?.metaBatidaEm == null) return 0;

  const apoiadores = await tx
    .select({ estudanteId: apoios.estudanteId })
    .from(apoios)
    .innerJoin(estudantes, eq(estudantes.id, apoios.estudanteId))
    .where(
      and(
        eq(apoios.pautaId, pautaId),
        sql`${apoios.criadoEm} <= ${pauta.metaBatidaEm.toISOString()}::timestamptz`,
        isNull(estudantes.saiuEm),
      ),
    );

  const parametros = [pauta.titulo, String(pauta.meta), pauta.slug];
  return enfileirarDisparos(
    tx,
    apoiadores.map(({ estudanteId }) => ({
      tipo: 'meta_batida' as const,
      aviso: pautaId,
      estudanteId,
      modelo: MODELO_META_BATIDA,
      parametros,
    })),
    agora,
  );
}
