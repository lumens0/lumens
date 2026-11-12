/**
 * Long polling do Telegram (`TELEGRAM_MODO=polling`): é como o bot roda na máquina do dev, sem
 * túnel nem URL pública. Em produção o modo é `webhook` e nada daqui roda.
 *
 *   deleteWebhook ─▶ getUpdates(offset, 30 s) ─▶ processarUpdate (o mesmo do webhook) ─▶ offset+1
 *                          ▲                               │ falhou (banco fora)
 *                          └──────── espera (1 s … 30 s) ◀─┘ e busca de novo o mesmo update
 *
 * O offset só avança depois que o update foi enfileirado: se o processo cair no meio, o Telegram
 * entrega de novo, e o dedup por `update_id` descarta o que já tinha entrado.
 */
import { resumoDoErro, type Logger } from '../../infra/logger';
import type { ApiDoTelegram } from './api';

export interface OpcoesDoPolling {
  api: Pick<ApiDoTelegram, 'chamar'>;
  /** O mesmo processamento do webhook. Lança se não deu para enfileirar. */
  processar: (update: unknown) => Promise<unknown>;
  logger: Logger;
  /** Segundos que o Telegram segura cada `getUpdates` esperando mensagem. */
  timeoutSegundos?: number;
  /** Espera depois de uma falha: começa aqui e dobra até `esperaMaximaMs`. */
  esperaInicialMs?: number;
  esperaMaximaMs?: number;
  /** Trocável nos testes. */
  esperar?: (ms: number, sinal: AbortSignal) => Promise<void>;
}

export interface Polling {
  /** Interrompe o `getUpdates` em andamento e espera o laço terminar. */
  parar(): Promise<void>;
}

const esperarPadrao = (ms: number, sinal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    sinal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

/** O que o `getUpdates` devolve; só o `update_id` importa aqui, o resto é do `processarUpdate`. */
type UpdateBruto = { update_id?: unknown } & Record<string, unknown>;

export async function iniciarPolling({
  api,
  processar,
  logger,
  timeoutSegundos = 30,
  esperaInicialMs = 1_000,
  esperaMaximaMs = 30_000,
  esperar = esperarPadrao,
}: OpcoesDoPolling): Promise<Polling> {
  const controle = new AbortController();
  const { signal: sinal } = controle;
  // Função, e não `sinal.aborted` direto: o valor muda durante os `await` do laço.
  const parado = () => sinal.aborted;

  // Com webhook registrado, o getUpdates responde 409. Mantém os updates pendentes: são mensagens
  // de gente esperando resposta.
  await api.chamar('deleteWebhook', { drop_pending_updates: false });
  logger.info('Telegram em long polling (webhook removido)');

  const laco = (async () => {
    let offset: number | undefined;
    let espera = esperaInicialMs;
    while (!parado()) {
      try {
        const updates = await api.chamar<UpdateBruto[]>(
          'getUpdates',
          {
            ...(offset === undefined ? {} : { offset }),
            timeout: timeoutSegundos,
            allowed_updates: ['message', 'callback_query'],
          },
          { sinal },
        );
        for (const update of updates) {
          if (parado()) break;
          await processar(update);
          // Update sem id não teria como ser confirmado; o schema do processar já o recusou.
          if (typeof update.update_id === 'number') offset = update.update_id + 1;
        }
        espera = esperaInicialMs;
      } catch (erro) {
        if (parado()) break;
        logger.warn(
          { erro: resumoDoErro(erro), esperaMs: espera },
          'long polling do Telegram falhou; tentando de novo',
        );
        await esperar(espera, sinal);
        espera = Math.min(espera * 2, esperaMaximaMs);
      }
    }
  })();

  return {
    async parar() {
      controle.abort();
      await laco;
    },
  };
}
