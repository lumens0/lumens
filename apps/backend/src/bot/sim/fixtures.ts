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
  buildTelegramDocument,
  buildTelegramPhoto,
  buildTelegramStart,
  buildTelegramText,
  type TelegramUpdate,
} from './telegram';
import {
  evolutionEncaminhada,
  evolutionImagem,
  evolutionStatus,
  evolutionTexto,
  type PayloadEvolution,
} from './evolution';

const FROM = '5582999990000';
const TS = '1767225600'; // 2026-01-01T00:00:00Z
const CHAT = 900000001;

export const FIXTURES_DIR = fileURLToPath(new URL('./__fixtures__', import.meta.url));

/** Nome do arquivo (sem .json) -> payload. */
export function fixtures(): Record<string, MetaWebhookPayload | TelegramUpdate | PayloadEvolution> {
  const comum = { from: FROM, timestamp: TS };
  const tg = { chatId: CHAT, date: Number(TS) };
  const evo = { from: FROM, timestamp: Number(TS) };
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
    // Evolution (SCRUM-275): messages.upsert e messages.update, com id e timestamp fixos.
    'evolution-texto': evolutionTexto({
      ...evo,
      id: '3EB0FIXTURETEXTO',
      body: 'buraco no bloco 12',
    }),
    'evolution-texto-lid': evolutionTexto({
      ...evo,
      id: '3EB0FIXTURELID',
      body: 'buraco no bloco 12',
      lid: '123456789012345',
    }),
    'evolution-encaminhada': evolutionEncaminhada({
      ...evo,
      id: '3EB0FIXTUREENCAMINHADA',
      body: 'URGENTE: repassem para todos os moradores',
    }),
    'evolution-imagem': evolutionImagem({
      ...evo,
      id: '3EB0FIXTUREIMAGEM',
      caption: 'poste apagado',
    }),
    'evolution-status': evolutionStatus({ id: '3EB0FIXTURESTATUS', status: 'DELIVERY_ACK' }),
  };
}
