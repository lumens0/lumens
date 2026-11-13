/**
 * Card de vitória (3.7c, RF-B18, SCRUM-241).
 *
 * Quando a conferência fecha com a pauta conquistada (`encerrarConferencia`), cada pessoa que
 * apoiou recebe a mensagem modelo `lumens_conquista`, que leva no cabeçalho o card da pauta gerado
 * pelo site (`/p/{slug}/card.png`, a 4.4) — o mesmo endpoint do card que o bot manda depois do
 * apoio (2.9), agora com o status "Conquistada". Quem manda é o worker da fila, dentro do limite do
 * canal (RNF06), como os outros avisos.
 *
 * Vai para todo mundo que apoiou, não só para quem respondeu à conferência ou apoiou antes de ela
 * abrir: a conquista é de quem apoiou a pauta. Quem saiu do sistema não recebe.
 */
import { and, apoios, eq, estudantes, isNull, pautas, type Tx } from '@lumens/db';
import { enfileirarDisparos } from './fila';

/** Mensagem modelo do card de vitória: título no corpo, card no cabeçalho, slug no botão. */
export const MODELO_VITORIA = 'lumens_conquista';

/**
 * Enfileira o card de vitória para quem apoia a pauta. Devolve quantos entraram.
 *
 * Só para pauta conquistada: chamar antes da mudança de status não enfileira nada. Chamar de novo
 * não repete, porque a fila não aceita o mesmo aviso duas vezes para a mesma pessoa.
 */
export async function enfileirarAvisoDeVitoria(
  tx: Tx,
  { pautaId, agora = new Date() }: { pautaId: string; agora?: Date },
): Promise<number> {
  const [pauta] = await tx
    .select({ titulo: pautas.titulo, slug: pautas.slug, status: pautas.status })
    .from(pautas)
    .where(eq(pautas.id, pautaId));
  if (pauta?.status !== 'conquistada') return 0;

  const apoiadores = await tx
    .select({ estudanteId: apoios.estudanteId })
    .from(apoios)
    .innerJoin(estudantes, eq(estudantes.id, apoios.estudanteId))
    .where(and(eq(apoios.pautaId, pautaId), isNull(estudantes.saiuEm)));

  const parametros = [pauta.titulo, pauta.slug];
  return enfileirarDisparos(
    tx,
    apoiadores.map(({ estudanteId }) => ({
      tipo: 'vitoria' as const,
      aviso: pautaId,
      estudanteId,
      modelo: MODELO_VITORIA,
      parametros,
    })),
    agora,
  );
}
