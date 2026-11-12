import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { SLUG_MAX } from '@lumens/contratos';
import { sql } from '@lumens/db';
import { apiPlugin, type ApiPluginOptions } from './api';
import { webhookDaEvolution } from './bot/canais/evolution/webhook';
import type { ApiDoTelegram } from './bot/telegram/api';
import { telegramPlugin } from './bot/telegram/routes';
import { webhookPlugin, type WebhookConfig, type WebhookPluginOptions } from './bot/webhook/routes';
import { resumoDoErro } from './infra/logger';

export type AppDeps = Omit<WebhookPluginOptions, 'config'> & {
  /** Webhook da Meta (WhatsApp). Sem ele, `/webhook` não existe (404): o WhatsApp está desligado. */
  config?: WebhookConfig;
  /**
   * Webhook do Telegram (`/telegram/webhook`), só no `TELEGRAM_MODO=webhook`. A `api` responde o
   * toque nos botões (`answerCallbackQuery`).
   */
  telegram?: { segredo: string; api?: Pick<ApiDoTelegram, 'chamar'> };
  /**
   * Webhook da Evolution (`/webhook/evolution`, SCRUM-275), quando o WhatsApp sai por ela
   * (`CANAL_WHATSAPP=evolution`). O segredo vem no header `Authorization`.
   */
  evolution?: { segredo: string };
  /** API de leitura pública: conexão só de leitura (`lumens_site`) e origens do CORS. */
  leitura: ApiPluginOptions;
};

/**
 * O log padrão do Fastify traz a URL inteira de cada requisição — e a query do handshake
 * da Meta carrega o META_VERIFY_TOKEN. Aqui só vai o caminho.
 */
function serializarRequisicao(req: FastifyRequest) {
  return { method: req.method, url: req.url.split('?')[0], remoteAddress: req.ip };
}

/**
 * Monta o servidor HTTP único do back-end: o webhook do bot e a API de leitura pública.
 * A API da curadoria (parte 5) entra aqui também.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // O padrão (100) é menor que o slug mais longo do contrato: um slug válido de 101 a 120
    // caracteres cairia no 404 genérico do Fastify, sem passar pela validação da API.
    routerOptions: { maxParamLength: SLUG_MAX * 2 },
    loggerInstance: deps.logger,
    childLoggerFactory: (logger, bindings, opts) =>
      logger.child(bindings, {
        ...opts,
        serializers: { ...opts.serializers, req: serializarRequisicao },
      }),
  }) as unknown as FastifyInstance;
  // Healthcheck da hospedagem (SCRUM-93). Vai ao banco de propósito: um processo vivo com o
  // banco fora do ar continua respondendo 200 num check que só olha o próprio processo, e o
  // deploy quebrado passa despercebido. Substituiu o /health, que devolvia ok sem checar nada.
  //
  // O corpo é genérico nos dois casos: healthcheck é público e não diz por que falhou.
  app.get('/saude', async (_req, reply) => {
    try {
      await deps.db.execute(sql`select 1`);
      return { ok: true };
    } catch (erro) {
      deps.logger.error({ erro: resumoDoErro(erro) }, 'healthcheck: banco indisponível');
      return reply.code(503).send({ ok: false });
    }
  });
  const { leitura, config, telegram, evolution, ...bot } = deps;
  if (config) await app.register(webhookPlugin, { ...bot, config });
  if (evolution) await app.register(webhookDaEvolution(evolution.segredo), bot);
  if (telegram) {
    await app.register(telegramPlugin, {
      ...bot,
      segredo: telegram.segredo,
      ...(telegram.api ? { api: telegram.api } : {}),
    });
  }
  await app.register(apiPlugin, leitura);
  return app;
}
