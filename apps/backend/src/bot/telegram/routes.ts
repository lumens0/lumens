import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginCallback } from 'fastify';
import { resumoDoErro } from '../../infra/logger';
import { processarUpdate, type DepsDoTelegram } from './update';

export interface TelegramPluginOptions extends DepsDoTelegram {
  /** O `secret_token` passado no `setWebhook`; o Telegram o devolve em todo POST. */
  segredo: string;
}

/** Comparação em tempo constante, também quando os tamanhos diferem. */
export function segredoConfere(recebido: string | undefined, segredo: string): boolean {
  if (recebido === undefined) return false;
  const a = Buffer.from(recebido, 'utf8');
  const b = Buffer.from(segredo, 'utf8');
  // Compara com ele mesmo para gastar o mesmo tempo e só então recusar pelo tamanho.
  return a.length === b.length ? timingSafeEqual(a, b) : !timingSafeEqual(b, b);
}

/**
 * Webhook do Telegram (`POST /telegram/webhook`), registrado com `secret_token` = o
 * TELEGRAM_WEBHOOK_SECRET. Mesma decisão do webhook da Meta: dedup + enfileiramento antes do 200,
 * numa transação curta. Se ela falhar, 500, e o Telegram reenvia o update.
 */
export const telegramPlugin: FastifyPluginCallback<TelegramPluginOptions> = (app, opts, done) => {
  const { segredo, logger } = opts;

  app.post('/telegram/webhook', async (req, reply) => {
    const header = req.headers['x-telegram-bot-api-secret-token'];
    if (!segredoConfere(typeof header === 'string' ? header : undefined, segredo)) {
      logger.warn({ temSegredo: header !== undefined }, 'segredo do webhook do Telegram inválido');
      return reply.code(401).send();
    }
    try {
      const resultado = await processarUpdate(req.body, opts);
      logger.debug({ resultado }, 'update do Telegram processado');
    } catch (erro) {
      // Nunca `{ err }`: o erro de query traz o job nos parâmetros.
      logger.error({ erro: resumoDoErro(erro) }, 'falha ao processar update do Telegram');
      return reply.code(500).send();
    }
    return reply.code(200).send();
  });

  done();
};
