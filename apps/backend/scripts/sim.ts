// Simulador de webhook do bot: monta o payload e envia ao back-end local. Canal `meta` (padrão):
// webhook da WhatsApp Cloud API, assinado. Canal `telegram`: `Update` da Bot API, com o header do
// segredo do webhook.
// Uso: pnpm --filter @lumens/backend sim <tipo> [args...] [--canal meta|telegram] [--from N]
//      [--chat N] [--url U] [--wamid W] [--update-id N] [--secret S] [--dry-run]
// Veja SIMULADOR.md para exemplos. O .env da raiz é carregado pelo script `sim`.
import {
  DEFAULT_FROM,
  buildButtonReply,
  buildForwardedMessage,
  buildImageMessage,
  buildListReply,
  buildStatus,
  buildTextMessage,
} from '../src/bot/sim/payloads';
import { sendSigned, signPayload, urlPadrao } from '../src/bot/sim/send';
import {
  DEFAULT_CHAT_ID,
  HEADER_SEGREDO_TELEGRAM,
  buildTelegramCallback,
  buildTelegramDocument,
  buildTelegramPhoto,
  buildTelegramStart,
  buildTelegramText,
  sendTelegram,
  urlPadraoTelegram,
  type TelegramUpdate,
} from '../src/bot/sim/telegram';
import type { MetaWebhookPayload } from '../src/bot/whatsapp/types';

const URL_PADRAO = urlPadrao(process.env.PORT);
const URL_PADRAO_TELEGRAM = urlPadraoTelegram(process.env.PORT);

const USAGE = `Uso: pnpm --filter @lumens/backend sim <tipo> [args...] [opções]

Canal meta (padrão) — webhook da WhatsApp Cloud API, assinado com META_APP_SECRET:
  texto <mensagem>            mensagem de texto
  encaminhada <mensagem>      texto com context.forwarded = true
  botao <id> <titulo>         resposta de botão (interactive.button_reply)
  lista <id> <titulo>         resposta de lista (interactive.list_reply)
  imagem [legenda]            imagem (mídia fictícia) com legenda opcional
  status <delivered|read>     evento de status (o webhook deve ignorar)

Canal telegram (--canal telegram) — Update da Bot API em POST /telegram/webhook:
  texto <mensagem>            mensagem de texto
  start [payload]             /start, com o payload opcional dos links do site
                              (nova, apoiar_<slug>, ajudar_<slug>)
  botao <data>                toque em botão do teclado inline (callback_query)
  foto [legenda]              foto (arquivo fictício) com legenda opcional
  documento [mime]            documento (arquivo fictício; padrão image/jpeg)

  A rota /telegram/webhook só existe com o back-end em TELEGRAM_MODO=webhook (no modo polling
  ela não é registrada e o POST dá 404). No .env da raiz:
    TELEGRAM_BOT_TOKEN=<token do @BotFather (qualquer valor liga o canal; com um falso, as
                       respostas do bot falham no envio)>
    TELEGRAM_MODO=webhook
    TELEGRAM_WEBHOOK_SECRET=<letras, números, _ e ->
  O back-end não chama o setWebhook: o bot real não passa a mandar updates para a sua máquina.

Opções:
  --canal <c>        meta (padrão) ou telegram
  --from <numero>    meta: remetente (padrão ${DEFAULT_FROM})
  --chat <id>        telegram: chat privado = from.id (padrão ${String(DEFAULT_CHAT_ID)})
  --url <url>        destino (padrão ${URL_PADRAO}; telegram: ${URL_PADRAO_TELEGRAM})
  --wamid <id>       meta: wamid fixo (para testar deduplicação)
  --update-id <n>    telegram: update_id fixo (padrão: um novo a cada envio)
  --secret <s>       meta: segredo da assinatura (padrão META_APP_SECRET do .env);
                     telegram: header ${HEADER_SEGREDO_TELEGRAM} (padrão TELEGRAM_WEBHOOK_SECRET)
  --dry-run          só imprime payload e assinatura/header, não envia
  -h, --help         esta ajuda`;

interface Parsed {
  positional: string[];
  flags: Record<string, string | true>;
}

function parseArgs(argv: string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  const valued = new Set(['from', 'url', 'wamid', 'secret', 'canal', 'chat', 'update-id']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) break;
    if (a === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a === '-h') {
      flags.help = true;
    } else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = eq >= 0 ? a.slice(2, eq) : a.slice(2);
      if (eq >= 0) flags[key] = a.slice(eq + 1);
      else if (valued.has(key)) {
        const v = argv[++i];
        if (v === undefined) fail(`opção --${key} exige um valor`);
        flags[key] = v;
      } else flags[key] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

function fail(msg: string): never {
  console.error(`erro: ${msg}\n\n${USAGE}`);
  process.exit(1);
}

function str(v: string | true | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Inteiro seguro (ids do Telegram), ou falha com a opção/argumento no erro. */
function inteiro(v: string | undefined, nome: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!/^-?\d+$/.test(v) || !Number.isSafeInteger(n)) fail(`${nome} deve ser um número inteiro`);
  return n;
}

function buildFromArgs(
  kind: string,
  args: string[],
  from: string,
  wamid: string | undefined,
): MetaWebhookPayload {
  const common = { from, wamid };
  switch (kind) {
    case 'texto':
    case 'encaminhada': {
      const body = args.join(' ');
      if (!body) fail(`${kind} exige o texto da mensagem`);
      return kind === 'texto'
        ? buildTextMessage({ ...common, body })
        : buildForwardedMessage({ ...common, body });
    }
    case 'botao':
    case 'lista': {
      const [id, ...rest] = args;
      const title = rest.join(' ');
      if (!id || !title) fail(`${kind} exige <id> <titulo>`);
      return kind === 'botao'
        ? buildButtonReply({ ...common, id, title })
        : buildListReply({ ...common, id, title });
    }
    case 'imagem': {
      const caption = args.join(' ');
      return buildImageMessage({ ...common, caption: caption || undefined });
    }
    case 'status': {
      const s = args[0];
      if (s !== 'delivered' && s !== 'read') fail('status exige delivered ou read');
      return buildStatus({ status: s, to: from, wamid });
    }
    default:
      fail(`tipo desconhecido: ${kind}`);
  }
}

function buildTelegramFromArgs(
  kind: string,
  args: string[],
  chatId: number | undefined,
  updateId: number | undefined,
): TelegramUpdate {
  const common = { chatId, updateId };
  switch (kind) {
    case 'texto': {
      const text = args.join(' ');
      if (!text) fail('texto exige o texto da mensagem');
      return buildTelegramText({ ...common, text });
    }
    case 'start':
      if (args.length > 1) fail('start aceita um só payload (sem espaços)');
      return buildTelegramStart({ ...common, payload: args[0] });
    case 'botao': {
      const data = args.join(' ');
      if (!data) fail('botao exige o data do botão');
      return buildTelegramCallback({ ...common, data });
    }
    case 'foto': {
      const caption = args.join(' ');
      return buildTelegramPhoto({ ...common, caption: caption || undefined });
    }
    case 'documento':
      return buildTelegramDocument({ ...common, mimeType: args[0] });
    default:
      fail(`tipo desconhecido no canal telegram: ${kind}`);
  }
}

async function enviar(url: string, envio: () => Promise<{ status: number; body: string }>) {
  try {
    const res = await envio();
    console.log(`POST ${url} -> HTTP ${String(res.status)}`);
    if (res.body) console.log(res.body);
    if (res.status >= 400) process.exitCode = 1;
  } catch (err) {
    console.error(
      `falha ao enviar para ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  }
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const [kind, ...args] = positional;
if (flags.help || kind === undefined) {
  console.log(USAGE);
  process.exit(flags.help ? 0 : 1);
}
const canal = str(flags.canal) ?? 'meta';
if (canal !== 'meta' && canal !== 'telegram') fail(`canal desconhecido: ${canal}`);
const soMeta = ['from', 'wamid'].filter((f) => f in flags);
const soTelegram = ['chat', 'update-id'].filter((f) => f in flags);
if (canal === 'telegram' && soMeta.length > 0)
  fail(`--${soMeta.join(', --')} só vale no canal meta`);
if (canal === 'meta' && soTelegram.length > 0) {
  fail(`--${soTelegram.join(', --')} só vale com --canal telegram`);
}

if (canal === 'telegram') {
  const url = str(flags.url) ?? URL_PADRAO_TELEGRAM;
  const secret = str(flags.secret) ?? process.env.TELEGRAM_WEBHOOK_SECRET;
  const update = buildTelegramFromArgs(
    kind,
    args,
    inteiro(str(flags.chat), '--chat'),
    inteiro(str(flags['update-id']), '--update-id'),
  );
  if (flags['dry-run'] === true) {
    console.log(JSON.stringify(update, null, 2));
    if (secret) console.log(`\nX-Telegram-Bot-Api-Secret-Token: ${secret}`);
    else console.log('\n(sem TELEGRAM_WEBHOOK_SECRET: header não definido)');
  } else {
    if (!secret) fail('TELEGRAM_WEBHOOK_SECRET ausente (defina no .env ou use --secret)');
    await enviar(url, () => sendTelegram(update, { url, secret }));
  }
} else {
  const from = str(flags.from) ?? DEFAULT_FROM;
  const url = str(flags.url) ?? URL_PADRAO;
  const secret = str(flags.secret) ?? process.env.META_APP_SECRET;

  const payload = buildFromArgs(kind, args, from, str(flags.wamid));

  if (flags['dry-run'] === true) {
    console.log(JSON.stringify(payload, null, 2));
    if (secret) console.log(`\nX-Hub-Signature-256: ${signPayload(payload, secret).signature}`);
    else console.log('\n(sem META_APP_SECRET: assinatura não calculada)');
  } else {
    if (!secret) fail('META_APP_SECRET ausente (defina no .env ou use --secret)');
    await enviar(url, () => sendSigned(payload, { url, secret }));
  }
}
