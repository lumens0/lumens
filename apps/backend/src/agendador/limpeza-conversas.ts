import type { Db } from '@lumens/db';
import { apagarCodigosVencidos, apagarRegistrosVencidos } from '@lumens/dominio';
import type { PgBoss } from 'pg-boss';
import { removerFotosSoltas } from '../bot/conversation/fotos-temporarias';
import type { ConversationStore } from '../bot/conversation/store';
import type { ServicoDeFotos } from '../fotos/servico';
import { deleteOldDedup } from '../bot/webhook/process';
import { JOBS } from '../infra/queue';

/**
 * De hora em hora (SCRUM-332). Era às 04:00, mas a homologação fica desligada de madrugada e o
 * pg-boss não recupera horário perdido: a limpeza nunca rodou. Ela é idempotente, então rodar
 * mais vezes só apaga menos de cada vez.
 */
export const CLEANUP_CRON = '0 * * * *';
export const CLEANUP_TZ = 'America/Maceio';

type Boss = Pick<PgBoss, 'getQueue' | 'createQueue' | 'schedule' | 'work' | 'send'>;

export interface CleanupResult {
  /** Conversas expiradas (conversa). */
  deleted: number;
  /** Dedup de webhook fora da janela de reenvio da Meta (mensagem_processada). */
  dedupDeleted: number;
  /** Códigos de verificação vencidos há mais de um dia (codigo_verificacao). */
  codigosDeleted: number;
  /** Registros dos limites da verificação fora da janela de 24 h (registro_verificacao, SCRUM-298). */
  registrosDeleted: number;
}

/**
 * Agenda a limpeza do bot, de hora em hora: conversas expiradas, o dedup antigo do webhook, os
 * códigos de verificação vencidos e os registros dos limites da verificação (SCRUM-298), que de
 * outro modo ficariam para sempre (minimização prometida no aviso de privacidade).
 *
 * Também roda uma vez na subida, no espírito da janela perdida (SCRUM-239): a VM liga depois de
 * horas desligada e não espera a próxima hora cheia.
 */
export async function registerCleanupJob(
  boss: Boss,
  deps: { store: ConversationStore; db: Db; fotos?: ServicoDeFotos },
  onDone?: (result: CleanupResult) => void,
): Promise<void> {
  const name = JOBS.cleanupConversations;
  if (!(await boss.getQueue(name))) await boss.createQueue(name);
  await boss.schedule(name, CLEANUP_CRON, null, { tz: CLEANUP_TZ });
  await boss.work(name, async () => {
    // Fotos da pauta nova que a pessoa deixou pela metade: os arquivos saem antes de a conversa sumir.
    await removerFotosSoltas(deps.db, deps.fotos, await deps.store.fotoChavesExpiradas());
    const result: CleanupResult = {
      deleted: await deps.store.deleteExpired(),
      dedupDeleted: await deleteOldDedup(deps.db),
      codigosDeleted: await apagarCodigosVencidos(deps.db),
      registrosDeleted: await apagarRegistrosVencidos(deps.db),
    };
    onDone?.(result);
    return result;
  });
  await boss.send(name, null);
}
