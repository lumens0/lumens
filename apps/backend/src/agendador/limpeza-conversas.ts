import type { Db } from '@lumens/db';
import { apagarCodigosVencidos, apagarRegistrosVencidos } from '@lumens/dominio';
import type { PgBoss } from 'pg-boss';
import { fotosSoltas } from '../bot/conversation/fotos-temporarias';
import { agendarRemocao, executarRemocoes } from '../fotos/remocao';
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
 * Apaga as conversas vencidas e, antes de cada uma, as fotos da pauta nova que ela ainda guardava
 * (arquivos sem relato). Devolve quantas conversas apagou.
 *
 * Cada conversa é tratada numa transação própria, com o mesmo lock por telefone que o router usa
 * (`store.lock`): se a pessoa está no meio de uma mensagem (por exemplo, o download da 3ª foto
 * atravessando o vencimento), a limpeza espera ela terminar, relê a conversa e, se ela foi
 * renovada, não toca em nada. Também usa um instante de corte só: uma conversa que vence enquanto
 * os arquivos de outra são removidos fica para a próxima execução, com as chaves.
 */
export async function limparConversasExpiradas(
  deps: { store: ConversationStore; db: Db; fotos?: ServicoDeFotos },
  corte: Date = deps.store.agora(),
): Promise<number> {
  let apagadas = 0;
  for (const telefone of await deps.store.telefonesExpirados(corte)) {
    // As chaves entram na fila durável de remoção na mesma transação que apaga a conversa: se ela
    // desfizer, a conversa continua com as chaves e as fotos continuam no storage; se confirmar, a
    // fila guarda as chaves até o storage confirmar a exclusão.
    await deps.db.transaction(async (tx) => {
      const store = deps.store.withDb(tx);
      await store.lock(telefone);
      const chaves = await store.fotoChavesSeExpirada(telefone, corte);
      if (chaves === undefined) return; // renovada ou já apagada: nada a fazer
      await agendarRemocao(tx, await fotosSoltas(tx, chaves));
      apagadas += await store.apagarSeExpirada(telefone, corte);
    });
  }
  // Esvazia a fila (as chaves daqui e as que falharam em rodadas anteriores).
  await executarRemocoes(deps.db, deps.fotos);
  return apagadas;
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
    const result: CleanupResult = {
      deleted: await limparConversasExpiradas(deps),
      dedupDeleted: await deleteOldDedup(deps.db),
      codigosDeleted: await apagarCodigosVencidos(deps.db),
      registrosDeleted: await apagarRegistrosVencidos(deps.db),
    };
    onDone?.(result);
    return result;
  });
  await boss.send(name, null);
}
