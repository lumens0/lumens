import type { Db } from '@lumens/db';
import { apagarChatsSemContato } from '@lumens/dominio';
import type { PgBoss } from 'pg-boss';
import type { ConversationStore } from '../bot/conversation/store';
import { deleteOldDedup } from '../bot/webhook/process';
import { JOBS } from '../infra/queue';

export const CLEANUP_CRON = '0 4 * * *';
export const CLEANUP_TZ = 'America/Maceio';

type Boss = Pick<PgBoss, 'getQueue' | 'createQueue' | 'schedule' | 'work'>;

export interface CleanupResult {
  /** Conversas expiradas (conversa). */
  deleted: number;
  /** Dedup de webhook fora da janela de reenvio da Meta (mensagem_processada). */
  dedupDeleted: number;
  /** Chats do Telegram que nunca compartilharam o contato, parados há mais de um dia. */
  chatsSemContato: number;
}

/**
 * Agenda a limpeza diária do bot (04:00 em Maceió): conversas expiradas, o dedup antigo do
 * webhook, que de outro modo cresceria para sempre, e os chats do Telegram que pararam antes de
 * compartilhar o contato (só guardavam o comando pendente).
 */
export async function registerCleanupJob(
  boss: Boss,
  deps: { store: ConversationStore; db: Db },
  onDone?: (result: CleanupResult) => void,
): Promise<void> {
  const name = JOBS.cleanupConversations;
  if (!(await boss.getQueue(name))) await boss.createQueue(name);
  await boss.schedule(name, CLEANUP_CRON, null, { tz: CLEANUP_TZ });
  await boss.work(name, async () => {
    const result: CleanupResult = {
      deleted: await deps.store.deleteExpired(),
      dedupDeleted: await deleteOldDedup(deps.db),
      chatsSemContato: await apagarChatsSemContato(deps.db),
    };
    onDone?.(result);
    return result;
  });
}
