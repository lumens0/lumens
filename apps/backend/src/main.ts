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
import { logSender, registerIncomingWorker, registerReplyWorker } from './bot/worker';
import { canalDoEnv, carregarEnv, type Env } from './config/env';
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

/**
 * Limite de pessoas por 24h dos avisos no Telegram: não há cota como a da Meta. O `telegramAvisoSender`
 * cuida do ritmo (30/s no total, 1/s por chat).
 */
const SEM_COTA = Number.MAX_SAFE_INTEGER;

if (process.argv.includes('--so-validar')) {
  console.log(`Ambiente validado. Banco: ${new URL(env.DATABASE_URL).host}`);
} else {
  await iniciar(env);
}

async function iniciar(env: Env): Promise<void> {
  const logger = criarLogger(env.LOG_LEVEL);
  // Um canal por implantação (CANAL_BOT). O token nunca vai para o log: só o canal e o modo.
  const canal = canalDoEnv(env);
  const whatsapp = canal.canal === 'whatsapp' ? canal : undefined;
  const telegram = canal.canal === 'telegram' ? canal : undefined;
  logger.info({ canal: canal.canal, modo: telegram?.modo }, 'canal do bot');

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
    const avisar = (mensagem: string) => {
      logger.warn(mensagem);
    };
    // A mídia é baixada pela API do canal ativo: `media id` da Meta ou `file_id` do Telegram. A
    // limpeza e o storage são os mesmos. PDF da resposta oficial (3.6): mesmo bucket, pasta
    // `respostas/`, que não é pública.
    const apiDoTelegram = telegram ? criarApiDoTelegram({ token: telegram.token }) : undefined;
    const baixar = (id: string, opcoes: { tamanhoMaximo?: number } = {}) =>
      apiDoTelegram
        ? baixarMidiaDoTelegram(id, { api: apiDoTelegram, ...opcoes })
        : baixarMidiaDaMeta(id, { token: whatsapp?.token ?? '', ...opcoes });
    const respostas = criarServicoDeRespostas({
      baixar: (id) => baixar(id, { tamanhoMaximo: TAMANHO_MAXIMO_PDF }),
      storage: storageDeArquivos,
      avisar,
    });
    const fotos = criarServicoDeFotos({
      baixar: (id) => baixar(id),
      storage: storageDeArquivos,
      avisar,
    });
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
    // Avisos pelo canal ativo. WhatsApp: no `pnpm dev` a fila anda sem a Meta; fora dele, envia de
    // verdade, e enquanto os modelos não forem aprovados a Meta recusa com erro passageiro e os
    // avisos esperam. Telegram: envia de verdade, sem a cota da Meta; o ritmo é do sender.
    if (apiDoTelegram) {
      await registerEnvioWorker(boss, {
        db,
        sender: telegramAvisoSender({ api: apiDoTelegram }),
        chaves,
        logger,
        limite: SEM_COTA,
      });
    } else if (whatsapp) {
      const modeloSender = MODO_DEV
        ? logModeloSender(logger)
        : graphSender({ token: whatsapp.token, phoneNumberId: whatsapp.phoneNumberId });
      await registerEnvioWorker(boss, {
        db,
        sender: whatsappAvisoSender(modeloSender),
        chaves,
        logger,
        limite: whatsapp.limitePessoas,
      });
    }
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
    });
    await registerReplyWorker(
      boss,
      apiDoTelegram
        ? telegramSender({ api: apiDoTelegram, chaves, logger })
        : // Ainda não há envio pela Cloud API: no WhatsApp as respostas só vão para o log.
          logSender(logger, chaves, { mostrarTexto: MODO_DEV }),
      logger,
    );

    const app = await buildApp({
      ...(whatsapp
        ? { config: { verifyToken: whatsapp.verifyToken, appSecret: whatsapp.appSecret } }
        : {}),
      ...(telegram?.modo === 'webhook' && telegram.segredoDoWebhook !== undefined && apiDoTelegram
        ? { telegram: { segredo: telegram.segredoDoWebhook, api: apiDoTelegram } }
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
