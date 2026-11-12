import { criarDb, criarPool } from '@lumens/db';
import { registerAvisoMetaBatidaJob } from './agendador/aviso-meta-batida';
import { registerGatilhosJob } from './agendador/gatilhos';
import { registerCleanupJob } from './agendador/limpeza-conversas';
import { buildApp } from './app';
import { ConversationStore } from './bot/conversation/store';
import { graphSender, logModeloSender, whatsappAvisoSender } from './bot/envio/sender';
import { registerEnvioWorker, registerStatusWorker } from './bot/envio/worker';
import { criarApiDoTelegram } from './bot/telegram/api';
import { telegramAvisoSender } from './bot/telegram/avisos';
import { iniciarPolling, type Polling } from './bot/telegram/polling';
import { telegramSender } from './bot/telegram/sender';
import { processarUpdate } from './bot/telegram/update';
import {
  logSender,
  registerIncomingWorker,
  registerReplyWorker,
  senderPorCanal,
} from './bot/worker';
import { carregarEnv, telegramDoEnv, whatsappDoEnv, type Env } from './config/env';
import { chavesDoEnv } from './cripto/cifra';
import { criarEmailSmtp, logEmail } from './email/codigo';
import { baixarMidiaDaMeta } from './fotos/meta-midia';
import { TAMANHO_MAXIMO_PDF, criarServicoDeRespostas } from './fotos/resposta-pdf';
import { criarServicoDeFotos } from './fotos/servico';
import { criarStorageS3 } from './fotos/storage';
import { baixarMidiaDoTelegram } from './fotos/telegram-midia';
import { criarLogger, resumoDoErro } from './infra/logger';
import { criarPgBossRuntime } from './infra/pg-boss';
import { filaPgBoss } from './infra/queue';

/**
 * Sem limite, um banco travado deixaria a transação de uma mensagem pendurada: o heartbeat segue
 * (o processo está vivo) e a conversa fica parada até o `expireInSeconds`. Com estes limites a
 * tentativa falha em segundos e volta pelo retry do pg-boss (e o `complete` amarrado à tentativa
 * cobre a que expirar mesmo assim).
 */
const POOL_TIMEOUTS = { conexaoMs: 5_000, consultaMs: 15_000 } as const;

/**
 * Entrada executável do back-end (`pnpm --filter @lumens/backend dev`).
 *
 * Valida o ambiente antes de tudo: ambiente incompleto derruba a inicialização com
 * uma mensagem que diz o que falta. Com `--so-validar` (o `env:check` do CI) para aí.
 */
let env: Env;
try {
  env = carregarEnv();
} catch (erro) {
  // Mensagem limpa: quem está configurando a máquina não precisa do stack trace.
  console.error(erro instanceof Error ? erro.message : String(erro));
  process.exit(1);
}

/**
 * `--dev` só vem do script `dev` (e do `env:check`, que é o `dev` validando). O `start` de
 * produção não passa a flag, e o scripts.test trava isso: o que é só para a máquina do dev
 * depende do comando, não de uma variável de ambiente que pode ser copiada para a hospedagem.
 */
const MODO_DEV = process.argv.includes('--dev');

if (process.argv.includes('--so-validar')) {
  console.log(`Ambiente validado. Banco: ${new URL(env.DATABASE_URL).host}`);
} else {
  await iniciar(env);
}

async function iniciar(env: Env): Promise<void> {
  const logger = criarLogger(env.LOG_LEVEL);
  const whatsapp = whatsappDoEnv(env);
  const telegram = telegramDoEnv(env);
  // O token do bot nunca vai para o log: só que o canal está ligado e em que modo.
  logger.info(
    { whatsapp: whatsapp !== undefined, telegram: telegram?.modo ?? false },
    'canais do bot',
  );

  try {
    const pool = criarPool(env.DATABASE_URL, POOL_TIMEOUTS, (erro) => {
      // Conexão ociosa derrubada pelo Postgres: o pool descarta e abre outra na próxima query.
      logger.error({ erro: resumoDoErro(erro) }, 'conexão do banco caiu');
    });
    const db = criarDb(pool);
    // Segunda conexão, com o login `lumens_site`: a API de leitura pública só enxerga as views
    // da T14, então nem um bug nela alcança telefone, e-mail ou quem apoiou (RNF01).
    const poolLeitura = criarPool(env.DATABASE_URL_LEITURA, POOL_TIMEOUTS, (erro) => {
      logger.error({ erro: resumoDoErro(erro) }, 'conexão de leitura do banco caiu');
    });

    // `db:migrate` instala/atualiza o schema `pgboss` com a role administrativa. A aplicação
    // apenas opera as filas; manutenção de índices também fica fora da role restrita.
    const boss = criarPgBossRuntime(env.DATABASE_URL, {
      useListenNotify: true,
      connectionTimeoutMillis: POOL_TIMEOUTS.conexaoMs,
    });
    boss.on('error', (erro) => {
      logger.error({ erro: resumoDoErro(erro) }, 'pg-boss error');
    });
    await boss.start();

    const queue = filaPgBoss(boss);
    const chaves = chavesDoEnv(env);
    const store = new ConversationStore(db);
    const storageDeArquivos = criarStorageS3({
      bucket: env.S3_BUCKET_FOTOS,
      regiao: env.AWS_REGION,
      endpoint: env.S3_ENDPOINT,
    });
    // PDF da resposta oficial (3.6): mesmo bucket, pasta `respostas/`, que não é pública.
    const avisar = (mensagem: string) => {
      logger.warn(mensagem);
    };
    // Sem o WhatsApp não há token da Meta: a mídia que chegasse por ele não teria como ser baixada
    // (e nem chega, porque o webhook da Meta não sobe).
    const tokenDaMeta = whatsapp?.token ?? '';
    const respostas = criarServicoDeRespostas({
      baixar: (mediaId) =>
        baixarMidiaDaMeta(mediaId, { token: tokenDaMeta, tamanhoMaximo: TAMANHO_MAXIMO_PDF }),
      storage: storageDeArquivos,
      avisar,
    });
    const fotos = criarServicoDeFotos({
      baixar: (mediaId) => baixarMidiaDaMeta(mediaId, { token: tokenDaMeta }),
      storage: criarStorageS3({
        bucket: env.S3_BUCKET_FOTOS,
        regiao: env.AWS_REGION,
        endpoint: env.S3_ENDPOINT,
      }),
      avisar,
    });
    // Telegram: a mesma limpeza e o mesmo storage, só o download muda (o id é um `file_id`).
    const apiDoTelegram = telegram ? criarApiDoTelegram({ token: telegram.token }) : undefined;
    const midiaDoTelegram = apiDoTelegram
      ? {
          fotos: criarServicoDeFotos({
            baixar: (fileId) => baixarMidiaDoTelegram(fileId, { api: apiDoTelegram }),
            storage: storageDeArquivos,
            avisar,
          }),
          respostas: criarServicoDeRespostas({
            baixar: (fileId) =>
              baixarMidiaDoTelegram(fileId, {
                api: apiDoTelegram,
                tamanhoMaximo: TAMANHO_MAXIMO_PDF,
              }),
            storage: storageDeArquivos,
            avisar,
          }),
        }
      : undefined;
    // No `pnpm dev` o código aparece no log; fora dele, vai pelo SMTP do `.env`.
    const email = MODO_DEV
      ? logEmail(logger)
      : criarEmailSmtp({
          host: env.EMAIL_HOST,
          porta: env.EMAIL_PORT,
          usuario: env.EMAIL_USUARIO,
          senha: env.EMAIL_SENHA,
          remetente: env.EMAIL_REMETENTE,
          avisar: (mensagem) => {
            logger.warn(mensagem);
          },
        });
    // As filas são criadas aqui, antes do servidor aceitar o primeiro webhook.
    await registerCleanupJob(boss, { store, db });
    await registerAvisoMetaBatidaJob(boss, { db, logger });
    // Cada aviso sai pelo canal do estudante. WhatsApp: no `pnpm dev` a fila anda sem a Meta; fora
    // dele, envia de verdade, e enquanto os modelos não forem aprovados a Meta recusa com erro
    // passageiro e os avisos esperam. Telegram: envia de verdade sempre que o bot está ligado.
    // Canal sem sender não é reservado: os avisos dele esperam na fila até ele ser configurado.
    const modeloSender = MODO_DEV
      ? logModeloSender(logger)
      : whatsapp && graphSender({ token: whatsapp.token, phoneNumberId: whatsapp.phoneNumberId });
    const avisoSenders = {
      ...(modeloSender ? { whatsapp: whatsappAvisoSender(modeloSender) } : {}),
      ...(apiDoTelegram ? { telegram: telegramAvisoSender({ api: apiDoTelegram }) } : {}),
    };
    if (Object.keys(avisoSenders).length > 0) {
      await registerEnvioWorker(boss, {
        db,
        senders: avisoSenders,
        chaves,
        logger,
        limite: env.META_LIMITE_PESSOAS,
      });
    } else {
      logger.warn('nenhum canal para avisos: eles ficam na fila sem envio');
    }
    if (!modeloSender) logger.warn('WhatsApp não configurado: os avisos dele ficam na fila');
    await registerStatusWorker(boss, { db, logger });
    await registerGatilhosJob(boss, { db, logger });
    await registerIncomingWorker(boss, {
      db,
      store,
      queue,
      logger,
      chaves,
      fotos,
      email,
      respostas,
      ...(midiaDoTelegram ? { midiaDoTelegram } : {}),
    });
    await registerReplyWorker(
      boss,
      senderPorCanal({
        // Ainda não há envio pela Cloud API: no WhatsApp as respostas só vão para o log.
        whatsapp: logSender(logger, chaves, { mostrarTexto: MODO_DEV }),
        ...(apiDoTelegram
          ? { telegram: telegramSender({ api: apiDoTelegram, chaves, logger }) }
          : {}),
      }),
      logger,
    );

    const app = await buildApp({
      ...(whatsapp
        ? { config: { verifyToken: whatsapp.verifyToken, appSecret: whatsapp.appSecret } }
        : {}),
      ...(telegram?.modo === 'webhook' && telegram.segredoDoWebhook !== undefined
        ? {
            telegram: {
              segredo: telegram.segredoDoWebhook,
              ...(apiDoTelegram ? { api: apiDoTelegram } : {}),
            },
          }
        : {}),
      db,
      queue,
      logger,
      chaves,
      leitura: { db: criarDb(poolLeitura), origensCors: env.CORS_ORIGENS },
    });
    await app.listen({ port: env.PORT, host: '0.0.0.0' });

    // Dev: busca as mensagens do Telegram sem túnel. Depois do listen, com as filas já prontas.
    let polling: Polling | undefined;
    if (telegram?.modo === 'polling' && apiDoTelegram) {
      polling = await iniciarPolling({
        api: apiDoTelegram,
        processar: (update) =>
          processarUpdate(update, { db, queue, logger, chaves, api: apiDoTelegram }),
        logger,
      });
    }

    let closing = false;
    const shutdown = async (signal: string) => {
      if (closing) return;
      closing = true;
      logger.info({ signal }, 'encerrando');
      try {
        await polling?.parar();
        await app.close();
        await boss.stop({ graceful: true });
        await pool.end();
        await poolLeitura.end();
        process.exit(0);
      } catch (err) {
        logger.error({ erro: resumoDoErro(err) }, 'erro no encerramento');
        process.exit(1);
      }
    };
    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
  } catch (err) {
    logger.fatal({ erro: resumoDoErro(err) }, 'falha ao iniciar');
    process.exit(1);
  }
}
