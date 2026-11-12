// Fixtures do webhook: payloads determinísticos (wamid/update_id e timestamp fixos) salvos em
// __fixtures__/*.json — os da Meta e, com prefixo `telegram-`, os do Telegram. Gerar de novo: pnpm --filter @lumens/backend fixtures
import { fileURLToPath } from 'node:url';
import type { MetaWebhookPayload } from '../whatsapp/types';
import {
  buildButtonReply,
  buildForwardedMessage,
  buildImageMessage,
  buildListReply,
  buildStatus,
  buildTextMessage,
} from './payloads';
import {
  buildTelegramCallback,
  buildTelegramContact,
  buildTelegramDocument,
  buildTelegramPhoto,
  buildTelegramStart,
  buildTelegramText,
  type TelegramUpdate,
} from './telegram';

const FROM = '5582999990000';
const TS = '1767225600'; // 2026-01-01T00:00:00Z
const CHAT = 900000001;
const OUTRA_PESSOA = 900000002;

export const FIXTURES_DIR = fileURLToPath(new URL('./__fixtures__', import.meta.url));

/** Nome do arquivo (sem .json) -> payload. */
export function fixtures(): Record<string, MetaWebhookPayload | TelegramUpdate> {
  const comum = { from: FROM, timestamp: TS };
  const tg = { chatId: CHAT, date: Number(TS) };
  return {
    texto: buildTextMessage({ ...comum, wamid: 'wamid.FIXTURE_TEXTO', body: 'buraco no bloco 12' }),
    encaminhada: buildForwardedMessage({
      ...comum,
      wamid: 'wamid.FIXTURE_ENCAMINHADA',
      body: 'URGENTE: repassem para todos os moradores',
    }),
    botao: buildButtonReply({
      ...comum,
      wamid: 'wamid.FIXTURE_BOTAO',
      id: 'confirmar',
      title: 'Confirmar',
    }),
    lista: buildListReply({
      ...comum,
      wamid: 'wamid.FIXTURE_LISTA',
      id: 'cat_iluminacao',
      title: 'Iluminação',
    }),
    imagem: buildImageMessage({
      ...comum,
      wamid: 'wamid.FIXTURE_IMAGEM',
      caption: 'poste apagado',
    }),
    'status-delivered': buildStatus({
      status: 'delivered',
      to: FROM,
      wamid: 'wamid.FIXTURE_STATUS',
      timestamp: TS,
    }),
    // Telegram: `Update`s da Bot API com update_id fixo (o simulador gera um novo a cada envio).
    'telegram-texto': buildTelegramText({ ...tg, updateId: 1001, text: 'buraco no bloco 12' }),
    'telegram-start': buildTelegramStart({ ...tg, updateId: 1002 }),
    'telegram-start-apoiar': buildTelegramStart({
      ...tg,
      updateId: 1003,
      payload: 'apoiar_bebedouro-quebrado-no-bloco-18',
    }),
    'telegram-botao': buildTelegramCallback({ ...tg, updateId: 1004, data: 'cat_iluminacao' }),
    'telegram-foto': buildTelegramPhoto({ ...tg, updateId: 1005, caption: 'poste apagado' }),
    'telegram-documento': buildTelegramDocument({ ...tg, updateId: 1006 }),
    'telegram-contato': buildTelegramContact({ ...tg, updateId: 1007, phoneNumber: FROM }),
    // Cartão de outra pessoa: contact.user_id ≠ from.id. O bot recusa.
    'telegram-contato-alheio': buildTelegramContact({
      ...tg,
      updateId: 1008,
      phoneNumber: '5582988887777',
      contactUserId: OUTRA_PESSOA,
    }),
  };
}
