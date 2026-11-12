// Construtores de `Update` da Bot API do Telegram e envio ao webhook local, usados pelo simulador
// (scripts/sim.ts --canal telegram), pelo gerador de fixtures e pelos testes. O webhook confere o
// header X-Telegram-Bot-Api-Secret-Token (não há assinatura do corpo, como na Meta).

export const DEFAULT_CHAT_ID = 900000001;
export const DEFAULT_NOME_TELEGRAM = 'Morador';
const BOT_ID = 800000001;
const BOT_USERNAME = 'LumensSimBot';

/** Header que o Telegram manda em todo POST do webhook com o `secret_token` do `setWebhook`. */
export const HEADER_SEGREDO_TELEGRAM = 'x-telegram-bot-api-secret-token';

/** Opções comuns a todos os updates simulados. */
export interface TelegramBaseOpts {
  /** Id do chat privado, que é também o `from.id` da pessoa. Padrão: 900000001. */
  chatId?: number | undefined;
  /** `update_id` fixo (para testar deduplicação). Padrão: um novo a cada chamada. */
  updateId?: number | undefined;
  /** Unix em segundos (número, como o Telegram envia). Padrão: agora. */
  date?: number | undefined;
  /** `message_id` fixo. Padrão: derivado do `update_id`. */
  messageId?: number | undefined;
}

let ultimoUpdateId = 0;

/**
 * `update_id` novo a cada chamada: crescente no mesmo processo e diferente entre execuções do
 * simulador (é o relógio em ms vezes mil). O dedup do bot é por `update_id`, então repetir o mesmo
 * comando não é engolido como duplicata.
 */
export function proximoUpdateId(): number {
  ultimoUpdateId = Math.max(ultimoUpdateId + 1, Date.now() * 1000);
  return ultimoUpdateId;
}

function agora(): number {
  return Math.floor(Date.now() / 1000);
}

function pessoa(chatId: number) {
  return { id: chatId, is_bot: false, first_name: DEFAULT_NOME_TELEGRAM, language_code: 'pt-br' };
}

function chatPrivado(chatId: number) {
  return { id: chatId, type: 'private', first_name: DEFAULT_NOME_TELEGRAM };
}

/** Envelope `update_id` + `message` de um chat privado; `conteudo` entra no `message`. */
function mensagem<C extends object>(opts: TelegramBaseOpts, conteudo: C) {
  const chatId = opts.chatId ?? DEFAULT_CHAT_ID;
  const updateId = opts.updateId ?? proximoUpdateId();
  return {
    update_id: updateId,
    message: {
      message_id: opts.messageId ?? updateId % 1_000_000,
      from: pessoa(chatId),
      chat: chatPrivado(chatId),
      date: opts.date ?? agora(),
      ...conteudo,
    },
  };
}

/** Mensagem de texto comum. */
export function buildTelegramText(opts: TelegramBaseOpts & { text: string }) {
  return mensagem(opts, { text: opts.text });
}

/**
 * `/start`, com o payload opcional dos links `t.me/<bot>?start=<payload>` do site (`nova`,
 * `apoiar_<slug>`, `ajudar_<slug>`). O Telegram marca o comando com uma entidade `bot_command`.
 */
export function buildTelegramStart(opts: TelegramBaseOpts & { payload?: string | undefined }) {
  const text = opts.payload === undefined ? '/start' : `/start ${opts.payload}`;
  return mensagem(opts, { text, entities: [{ type: 'bot_command', offset: 0, length: 6 }] });
}

/** Toque num botão do teclado inline (`callback_query`), com o `data` do botão. */
export function buildTelegramCallback(opts: TelegramBaseOpts & { data: string }) {
  const chatId = opts.chatId ?? DEFAULT_CHAT_ID;
  const updateId = opts.updateId ?? proximoUpdateId();
  return {
    update_id: updateId,
    callback_query: {
      id: `sim-callback-${String(updateId)}`,
      from: pessoa(chatId),
      chat_instance: '-1000000000000000001',
      data: opts.data,
      // A mensagem do bot onde o teclado estava.
      message: {
        message_id: opts.messageId ?? updateId % 1_000_000,
        from: { id: BOT_ID, is_bot: true, first_name: 'Lumens', username: BOT_USERNAME },
        chat: chatPrivado(chatId),
        date: opts.date ?? agora(),
        text: 'Escolha uma opção:',
      },
    },
  };
}

/** Foto (arquivo fictício) em três tamanhos, como o Telegram manda, com legenda opcional. */
export function buildTelegramPhoto(opts: TelegramBaseOpts & { caption?: string | undefined }) {
  const tamanhos = [
    { lado: 90, bytes: 1_200 },
    { lado: 320, bytes: 15_000 },
    { lado: 1280, bytes: 120_000 },
  ];
  return mensagem(opts, {
    photo: tamanhos.map(({ lado, bytes }) => ({
      file_id: `SIM-FOTO-${String(lado)}`,
      file_unique_id: `SIMFOTO${String(lado)}`,
      width: lado,
      height: Math.round((lado * 3) / 4),
      file_size: bytes,
    })),
    ...(opts.caption === undefined ? {} : { caption: opts.caption }),
  });
}

/** Documento (arquivo fictício): foto enviada "como arquivo", PDF etc. */
export function buildTelegramDocument(
  opts: TelegramBaseOpts & {
    mimeType?: string | undefined;
    fileName?: string | undefined;
    caption?: string | undefined;
  },
) {
  return mensagem(opts, {
    document: {
      file_id: 'SIM-DOCUMENTO',
      file_unique_id: 'SIMDOCUMENTO',
      file_name: opts.fileName ?? 'foto.jpg',
      mime_type: opts.mimeType ?? 'image/jpeg',
      file_size: 250_000,
    },
    ...(opts.caption === undefined ? {} : { caption: opts.caption }),
  });
}

/** Qualquer update montado pelos construtores acima. */
export type TelegramUpdate =
  ReturnType<typeof mensagem<object>> | ReturnType<typeof buildTelegramCallback>;

/**
 * Destino padrão do simulador no canal Telegram: o webhook local na PORT do .env (vazia vale
 * 3001). A rota só existe com TELEGRAM_MODO=webhook.
 */
export function urlPadraoTelegram(porta: string | undefined): string {
  return `http://localhost:${porta === undefined || porta === '' ? '3001' : porta}/telegram/webhook`;
}

/** Faz POST do update para `url` com o header do segredo. Retorna status HTTP e corpo. */
export async function sendTelegram(
  update: unknown,
  opts: { url: string; secret: string },
): Promise<{ status: number; body: string }> {
  const res = await fetch(opts.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [HEADER_SEGREDO_TELEGRAM]: opts.secret },
    body: JSON.stringify(update),
  });
  return { status: res.status, body: await res.text() };
}
