import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { SLUG_MAX } from '@lumens/contratos';
import { sql } from '@lumens/db';
import { apiPlugin, type ApiPluginOptions } from './api';
import { webhookDaEvolution } from './bot/canais/evolution/webhook';
import type { ApiDoTelegram } from './bot/telegram/api';
import { telegramPlugin } from './bot/telegram/routes';
import { webhookPlugin, type WebhookConfig, type WebhookPluginOptions } from './bot/webhook/routes';
import { resumoDoErro } from './infra/logger';

/** Quanto tempo o estado do chip consultado na Evolution vale para o `/saude/whatsapp`. */
export const VALIDADE_DO_ESTADO_MS = 10_000;

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
  evolution?: {
    segredo: string;
    /**
     * Estado da sessão do chip (`open` = conectada), para o `/saude/whatsapp` (SCRUM-341). Sem
     * ele (dev sem `EVOLUTION_URL`), a rota existe e responde 503: o canal é a Evolution, mas não
     * há chip para conferir.
     */
    estadoDaConexao?: () => Promise<string>;
  };
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
  // O chip da Evolution (SCRUM-341), fora do /saude: o /saude é o healthcheck do contêiner, e o
  // WhatsApp caído não é motivo para dar o back-end por doente. Sem esta rota, a sessão que não
  // volta depois de religar a VM deixa o bot mudo sem nenhum aviso. O smoke test do CI olha aqui.
  //
  // Existe sempre que o canal é a Evolution: o 404 fica só para Meta e Telegram, e uma ligação
  // perdida no `main.ts` aparece como 503, não como "nada a conferir". O corpo é genérico como o
  // do /saude; o estado vai só para o log. A rota é pública: a resposta vale por 10 s e é
  // dividida entre os pedidos, para ninguém de fora transformar cada GET numa chamada à
  // Evolution (que é quem envia as respostas do bot) e numa linha de log.
  if (deps.evolution) {
    const consultar = deps.evolution.estadoDaConexao ?? (() => Promise.resolve('sem_consulta'));
    let ultima: { em: number; estado: Promise<string> } | undefined;
    const estadoRecente = (): Promise<string> => {
      const agora = Date.now();
      if (ultima === undefined || agora - ultima.em >= VALIDADE_DO_ESTADO_MS) {
        const estado = consultar();
        void estado.then((e) => {
          if (e !== 'open') {
            deps.logger.warn(
              { estado: e },
              'healthcheck: WhatsApp da Evolution não está conectado',
            );
          }
        });
        ultima = { em: agora, estado };
      }
      return ultima.estado;
    };
    app.get('/saude/whatsapp', async (_req, reply) => {
      if ((await estadoRecente()) === 'open') return { ok: true };
      return reply.code(503).send({ ok: false });
    });
  }
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
