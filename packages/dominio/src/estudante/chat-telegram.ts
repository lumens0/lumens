/**
 * O chat do Telegram e o telefone de quem fala nele (SCRUM-267, tabela `chat_telegram`).
 *
 * A identidade é o telefone, a mesma do WhatsApp: o Telegram só traz o chat id em cada update, e
 * o telefone chega uma vez, quando a pessoa compartilha o próprio contato. Daí em diante o chat
 * fala com a conversa e o cadastro chaveados pelo HMAC do telefone.
 *
 * Tudo aqui recebe HMAC e cifra prontos: quem tem as chaves é o backend.
 */
import { and, chatsTelegram, eq, estudantes, inArray, isNull, lt, ne, type Db } from '@lumens/db';

/** Por quanto tempo um chat que não compartilhou o contato guarda o comando que espera. */
export const CHAT_SEM_CONTATO_EXPIRA_MS = 24 * 60 * 60 * 1000;

export interface ChatTelegram {
  chatCifrado: string;
  /** `null` até a pessoa compartilhar o contato. */
  telefoneHmac: string | null;
  telefoneCifrado: string | null;
  comandoPendenteCifrado: string | null;
}

export async function chatTelegramDe(db: Db, chatHmac: string): Promise<ChatTelegram | undefined> {
  const [linha] = await db
    .select({
      chatCifrado: chatsTelegram.chatCifrado,
      telefoneHmac: chatsTelegram.telefoneHmac,
      telefoneCifrado: chatsTelegram.telefoneCifrado,
      comandoPendenteCifrado: chatsTelegram.comandoPendenteCifrado,
    })
    .from(chatsTelegram)
    .where(eq(chatsTelegram.chatHmac, chatHmac));
  return linha;
}

/**
 * Guarda o texto que chegou antes do contato (o último vale), para rodar depois que ele for
 * aceito. Só para chat sem telefone: o de um chat já ligado vai direto para a conversa.
 */
export async function guardarComandoPendente(
  db: Db,
  {
    chatHmac,
    chatCifrado,
    comandoCifrado,
    agora = new Date(),
  }: { chatHmac: string; chatCifrado: string; comandoCifrado: string; agora?: Date },
): Promise<void> {
  await db
    .insert(chatsTelegram)
    .values({ chatHmac, chatCifrado, comandoPendenteCifrado: comandoCifrado, atualizadoEm: agora })
    .onConflictDoUpdate({
      target: chatsTelegram.chatHmac,
      set: { comandoPendenteCifrado: comandoCifrado, atualizadoEm: agora },
      setWhere: isNull(chatsTelegram.telefoneHmac),
    });
}

/**
 * Liga o chat ao telefone do contato que a pessoa compartilhou e tira o comando pendente. Um
 * telefone tem um chat só: se outro chat tinha este telefone (a pessoa trocou de conta no
 * Telegram), ele perde a ligação e volta a pedir o contato.
 */
export async function vincularChatTelegram(
  db: Db,
  {
    chatHmac,
    chatCifrado,
    telefoneHmac,
    telefoneCifrado,
    agora = new Date(),
  }: {
    chatHmac: string;
    chatCifrado: string;
    telefoneHmac: string;
    telefoneCifrado: string;
    agora?: Date;
  },
): Promise<void> {
  await db
    .delete(chatsTelegram)
    .where(and(eq(chatsTelegram.telefoneHmac, telefoneHmac), ne(chatsTelegram.chatHmac, chatHmac)));
  const ligacao = {
    chatCifrado,
    telefoneHmac,
    telefoneCifrado,
    comandoPendenteCifrado: null,
    atualizadoEm: agora,
  };
  await db
    .insert(chatsTelegram)
    .values({ chatHmac, ...ligacao })
    .onConflictDoUpdate({ target: chatsTelegram.chatHmac, set: ligacao });
}

/**
 * Apaga o chat ligado a um telefone: o próximo update dele pede o contato de novo, e os avisos
 * voltam ao WhatsApp. Usado quando o vínculo do telefone é apagado (sair do Lumens) e quando o
 * Telegram diz que a pessoa bloqueou o bot. Devolve se havia chat.
 */
export async function apagarChatTelegram(db: Db, telefoneHmac: string): Promise<boolean> {
  const apagados = await db
    .delete(chatsTelegram)
    .where(eq(chatsTelegram.telefoneHmac, telefoneHmac))
    .returning({ chatHmac: chatsTelegram.chatHmac });
  return apagados.length > 0;
}

/**
 * O Telegram recusou um aviso porque a pessoa bloqueou o bot (403): apaga o chat do estudante, e
 * os próximos avisos dele vão pelo WhatsApp. Só apaga se o chat ainda for o mesmo do aviso
 * recusado (`chatCifrado` é o destino que a reserva leu): se a pessoa já ligou outro chat nesse
 * meio-tempo, ele fica. Devolve se apagou.
 */
export async function apagarChatBloqueado(
  db: Db,
  { estudanteId, chatCifrado }: { estudanteId: string; chatCifrado: string },
): Promise<boolean> {
  const apagados = await db
    .delete(chatsTelegram)
    .where(
      and(
        eq(chatsTelegram.chatCifrado, chatCifrado),
        inArray(
          chatsTelegram.telefoneHmac,
          db
            .select({ telefoneHmac: estudantes.telefoneHmac })
            .from(estudantes)
            .where(eq(estudantes.id, estudanteId)),
        ),
      ),
    )
    .returning({ chatHmac: chatsTelegram.chatHmac });
  return apagados.length > 0;
}

/** Limpeza diária: chats que nunca compartilharam o contato, parados há mais de um dia. */
export async function apagarChatsSemContato(db: Db, agora: Date = new Date()): Promise<number> {
  const apagados = await db
    .delete(chatsTelegram)
    .where(
      and(
        isNull(chatsTelegram.telefoneHmac),
        lt(chatsTelegram.atualizadoEm, new Date(agora.getTime() - CHAT_SEM_CONTATO_EXPIRA_MS)),
      ),
    )
    .returning({ chatHmac: chatsTelegram.chatHmac });
  return apagados.length;
}
