/**
 * Aviso de aprovação (SCRUM-300).
 *
 * Quando a curadoria aprova a pauta (`aprovarPauta`), quem é responsável por ela recebe a mensagem
 * modelo `lumens_pauta_aprovada`: a pauta já está no site, recebendo apoios. É a contrapartida do
 * aviso de recusa, e cumpre o que o bot promete a quem cria a pauta ("você recebe uma mensagem
 * quando ela for aprovada ou recusada").
 *
 * Vai para os mesmos responsáveis que a recusa avisa: papel ativo e quem não saiu do sistema.
 */
import { and, eq, estudantes, isNull, papeisPauta, pautas, type Tx } from '@lumens/db';
import { enfileirarDisparos } from './fila';

/** Mensagem modelo da aprovação: título no corpo, slug no botão "Ver a pauta". */
export const MODELO_PAUTA_APROVADA = 'lumens_pauta_aprovada';

/**
 * Enfileira o aviso de aprovação para os responsáveis da pauta. Devolve quantos entraram.
 *
 * Quem chama garante que a aprovação aconteceu; chamar de novo não repete, porque a fila não aceita
 * o mesmo aviso duas vezes para a mesma pessoa.
 */
export async function enfileirarAvisoDeAprovacao(
  tx: Tx,
  { pautaId, agora = new Date() }: { pautaId: string; agora?: Date },
): Promise<number> {
  const [pauta] = await tx
    .select({ titulo: pautas.titulo, slug: pautas.slug })
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

  const parametros = [pauta.titulo, pauta.slug];
  return enfileirarDisparos(
    tx,
    responsaveis.map(({ estudanteId }) => ({
      tipo: 'aprovacao' as const,
      aviso: pautaId,
      estudanteId,
      modelo: MODELO_PAUTA_APROVADA,
      parametros,
    })),
    agora,
  );
}
