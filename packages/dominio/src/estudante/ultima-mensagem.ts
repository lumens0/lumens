import { and, estudantes, eq, isNull, lt, or, type Tx } from '@lumens/db';

/**
 * Grava que a pessoa mandou uma mensagem ao bot (SCRUM-275): qualquer mensagem, entendida ou não
 * (áudio, foto fora de hora, figurinha). É o que decide quem recebe aviso no WhatsApp pela
 * Evolution, onde o bot só escreve para quem falou com ele nas últimas 24h.
 *
 * Quem não tem cadastro não é afetado: aviso só vai para estudante. Mensagem que esperou na fila
 * não volta o relógio de quem já falou depois. Devolve se gravou.
 */
export async function registrarMensagemRecebida(
  tx: Tx,
  { telefoneHmac, agora = new Date() }: { telefoneHmac: string; agora?: Date },
): Promise<boolean> {
  const atualizados = await tx
    .update(estudantes)
    .set({ ultimaMensagemEm: agora })
    .where(
      and(
        eq(estudantes.telefoneHmac, telefoneHmac),
        or(isNull(estudantes.ultimaMensagemEm), lt(estudantes.ultimaMensagemEm, agora)),
      ),
    )
    .returning({ id: estudantes.id });
  return atualizados.length > 0;
}
