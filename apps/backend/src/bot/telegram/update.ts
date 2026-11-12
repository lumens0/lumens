/**
 * Entrada do Telegram: do `Update` da Bot API até o mesmo job da fila que o webhook da Meta gera.
 *
 *   Update ─▶ zod (só o que usamos) ─▶ mensagemDoUpdate ─▶ jobDoTelegram ─▶ dedup + fila
 *            chat privado, sem bot      (pura)              (HMAC e cifra)   (enfileirarUmaVez)
 *
 * A identidade da pessoa é o chat id: o HMAC de `tg:<chat_id>` ocupa o lugar do HMAC do telefone
 * (o prefixo impede que um chat id colida com um telefone), e o chat id vai cifrado. O dedup é o
 * HMAC de `tg:<update_id>`, na mesma tabela do wamid.
 *
 * A conversa não sabe de onde veio a mensagem: botão vira o texto do id, `/start <payload>` vira o
 * comando que o link do site manda no WhatsApp.
 */
import { PRIORIDADE } from '@lumens/dominio';
import { z } from 'zod';
import { cifrar, hmacHex, type Chaves } from '../../cripto/cifra';
import { resumoDoErro } from '../../infra/logger';
import { hashPhone } from '../conversation/phone';
import {
  cifrarConteudo,
  enfileirarUmaVez,
  paraJsonb,
  type ConteudoMensagem,
  type IncomingMessageJob,
  type ProcessDeps,
} from '../webhook/process';
import type { ApiDoTelegram } from './api';

/** Mesmo saneamento do webhook da Meta: o jsonb do Postgres recusa \u0000 e surrogate solto. */
const texto = z.string().transform(paraJsonb);

const chatSchema = z.object({ id: z.number().int(), type: z.string() });
const deSchema = z.object({ id: z.number().int(), is_bot: z.boolean().optional() });

const mensagemSchema = z.object({
  message_id: z.number().int(),
  date: z.number().int(),
  chat: chatSchema,
  from: deSchema.optional(),
  text: texto.optional(),
  caption: texto.optional(),
  photo: z
    .array(
      z.object({
        file_id: z.string().min(1),
        width: z.number().optional(),
        height: z.number().optional(),
        file_size: z.number().optional(),
      }),
    )
    .optional(),
  document: z.object({ file_id: z.string().min(1), mime_type: texto.optional() }).optional(),
});

const callbackSchema = z.object({
  id: z.string().min(1),
  from: deSchema.optional(),
  data: texto.optional(),
  // Sem `message` (botão de mensagem inline em outro chat): não é conversa com o bot.
  message: z.object({ chat: chatSchema, date: z.number().int().optional() }).optional(),
});

/** O subconjunto do `Update` que o bot usa. O resto (edição, canal, enquete) é ignorado. */
export const updateSchema = z.object({
  update_id: z.number().int(),
  message: mensagemSchema.optional(),
  callback_query: callbackSchema.optional(),
});

export type Update = z.infer<typeof updateSchema>;

/** O que interessa de um update, antes de virar job (sem HMAC nem cifra: dá para testar puro). */
export interface MensagemDoTelegram {
  updateId: number;
  chatId: number;
  /** Mesmo vocabulário do `type` da Meta: `text`, `interactive`, `image`, `document`. */
  type: string;
  /** Segundos, como o `timestamp` da Meta. */
  timestamp: string;
  conteudo: ConteudoMensagem;
  /** Botão tocado: o spinner do botão só para com o `answerCallbackQuery`. */
  callbackQueryId?: string;
}

export type ResultadoDoUpdate =
  | { tipo: 'mensagem'; mensagem: MensagemDoTelegram }
  | {
      tipo: 'ignorado';
      motivo: string;
      callbackQueryId?: string;
      /** Aviso curto que o Telegram mostra sobre o chat ao responder o botão. */
      avisoDoBotao?: string;
    };

/**
 * Resposta rápida de um aviso da fila: `tipo:aviso:índice` (`envio/aviso.ts`). Nenhum fluxo da
 * conversa lê esse payload ainda — nem no WhatsApp. Se fosse para a conversa como texto, viraria
 * resposta à pergunta em aberto (o título de uma pauta nova, por exemplo). Por isso o toque é só
 * respondido, com um aviso, e não entra na fila.
 */
const RESPOSTA_DE_AVISO = new RegExp(`^(?:${Object.keys(PRIORIDADE).join('|')}):[^:\\s]+:\\d+$`);

export const AVISO_SEM_RESPOSTA_TEXT =
  'Ainda não consigo registrar essa resposta pelo botão. Mande menu para ver as opções.';

/**
 * Os links `t.me/<bot>?start=<payload>` do site. O `start` só aceita `A-Z a-z 0-9 _ -`, então o
 * comando vem codificado; aqui ele volta a ser o texto que o link do WhatsApp manda.
 */
export function comandoDoStart(payload: string | undefined): string {
  if (payload === undefined) return 'menu';
  if (payload === 'nova') return 'nova pauta';
  const partes = /^(apoiar|ajudar)_(.+)$/.exec(payload);
  // Payload desconhecido: abre o menu em vez de tratar o código como resposta a uma pergunta.
  return partes ? `${partes[1] ?? ''} ${partes[2] ?? ''}` : 'menu';
}

const START = /^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/;

/**
 * `/start` sem payload vira `menu`: no primeiro contato o router põe o aviso de privacidade antes
 * do menu (5.7); no meio de um fluxo, volta ao menu sem perder o comando pendente.
 */
function textoDaMensagem(bruto: string): string {
  const start = START.exec(bruto.trim());
  return start ? comandoDoStart(start[1]) : bruto;
}

/** Converte um update já validado. Pura: sem chaves, sem banco. */
export function mensagemDoUpdate(update: Update): ResultadoDoUpdate {
  const { callback_query: callback, message } = update;
  if (callback) {
    const chat = callback.message?.chat;
    const base = { callbackQueryId: callback.id };
    if (!chat || chat.type !== 'private') return { tipo: 'ignorado', motivo: 'chat', ...base };
    if (callback.data === undefined || callback.data === '') {
      return { tipo: 'ignorado', motivo: 'callback sem data', ...base };
    }
    if (RESPOSTA_DE_AVISO.test(callback.data)) {
      return {
        tipo: 'ignorado',
        motivo: 'resposta de aviso',
        ...base,
        avisoDoBotao: AVISO_SEM_RESPOSTA_TEXT,
      };
    }
    return {
      tipo: 'mensagem',
      mensagem: {
        updateId: update.update_id,
        chatId: chat.id,
        type: 'interactive',
        // O callback não traz a hora do toque; a do update é agora.
        timestamp: String(Math.floor(Date.now() / 1000)),
        conteudo: { text: { body: callback.data } },
        callbackQueryId: callback.id,
      },
    };
  }
  if (!message) return { tipo: 'ignorado', motivo: 'tipo de update' };
  if (message.chat.type !== 'private') return { tipo: 'ignorado', motivo: 'chat' };
  if (message.from?.is_bot === true) return { tipo: 'ignorado', motivo: 'bot' };

  const base = {
    updateId: update.update_id,
    chatId: message.chat.id,
    timestamp: String(message.date),
  };
  const maior = message.photo?.reduce((a, b) =>
    (b.file_size ?? (b.width ?? 0) * (b.height ?? 0)) >
    (a.file_size ?? (a.width ?? 0) * (a.height ?? 0))
      ? b
      : a,
  );
  if (maior) {
    // O Telegram recomprime toda foto como JPEG. A legenda vai como no WhatsApp: junto da foto,
    // e a conversa não a lê como resposta.
    return {
      tipo: 'mensagem',
      mensagem: {
        ...base,
        type: 'image',
        conteudo: {
          image: {
            id: maior.file_id,
            mime_type: 'image/jpeg',
            sha256: '',
            ...(message.caption === undefined ? {} : { caption: message.caption }),
          },
        },
      },
    };
  }
  if (message.document) {
    return {
      tipo: 'mensagem',
      mensagem: {
        ...base,
        type: 'document',
        conteudo: {
          document: {
            id: message.document.file_id,
            mime_type: message.document.mime_type ?? 'application/octet-stream',
          },
        },
      },
    };
  }
  if (message.text !== undefined) {
    return {
      tipo: 'mensagem',
      mensagem: {
        ...base,
        type: 'text',
        conteudo: { text: { body: textoDaMensagem(message.text) } },
      },
    };
  }
  // Figurinha, áudio, vídeo, localização: vai sem conteúdo, e o worker responde que só entende
  // texto (o mesmo que acontece com esses tipos no WhatsApp).
  return { tipo: 'mensagem', mensagem: { ...base, type: 'unsupported', conteudo: {} } };
}

export const PHONE_NUMBER_ID_TELEGRAM = 'telegram';

/** A chave do remetente no Telegram: o HMAC de `tg:<chat_id>`, no lugar do HMAC do telefone. */
export function chaveDoChat(chatId: number, chaves: Chaves): string {
  return hashPhone(`tg:${String(chatId)}`, chaves.hmac);
}

export function jobDoTelegram(mensagem: MensagemDoTelegram, chaves: Chaves): IncomingMessageJob {
  const updateId = String(mensagem.updateId);
  return {
    canal: 'telegram',
    wamidHmac: hmacHex(`tg:${updateId}`, chaves.hmac),
    wamidCifrado: cifrar(updateId, chaves.cifra),
    phoneHmac: chaveDoChat(mensagem.chatId, chaves),
    phoneCifrado: cifrar(String(mensagem.chatId), chaves.cifra),
    phoneNumberId: PHONE_NUMBER_ID_TELEGRAM,
    type: mensagem.type,
    timestamp: mensagem.timestamp,
    contentCifrado: cifrarConteudo(mensagem.conteudo, chaves),
  };
}

export type ResultadoDoTelegram = 'enfileirada' | 'duplicada' | 'ignorada' | 'invalida';

export interface DepsDoTelegram extends ProcessDeps {
  /** Para o `answerCallbackQuery`. Sem ele, o botão fica girando até o Telegram desistir. */
  api?: Pick<ApiDoTelegram, 'chamar'>;
}

/**
 * Processa um update (do webhook ou do long polling). Lança só se o dedup + enfileiramento falhar
 * (banco fora): aí o webhook responde 500 e o Telegram reenvia, e o polling não avança o offset.
 * Update fora do formato é ignorado: reenviá-lo não o conserta.
 */
export async function processarUpdate(
  bruto: unknown,
  deps: DepsDoTelegram,
): Promise<ResultadoDoTelegram> {
  const update = updateSchema.safeParse(bruto);
  if (!update.success) {
    // Só o caminho dos campos, nunca os valores.
    const campos = update.error.issues.map((problema) => problema.path.join('.'));
    deps.logger.warn({ campos }, 'update do Telegram fora do formato, ignorado');
    return 'invalida';
  }
  const resultado = mensagemDoUpdate(update.data);
  if (resultado.tipo === 'ignorado') {
    deps.logger.info({ motivo: resultado.motivo }, 'update do Telegram ignorado');
    responderBotao(resultado.callbackQueryId, deps, resultado.avisoDoBotao);
    return 'ignorada';
  }
  const job = jobDoTelegram(resultado.mensagem, deps.chaves);
  const nova = await enfileirarUmaVez(job, deps);
  deps.logger
    .child({ mensagem: job.wamidHmac.slice(0, 12) })
    .info(
      { type: job.type, canal: 'telegram' },
      nova ? 'mensagem enfileirada' : 'mensagem duplicada, ignorando',
    );
  // Depois do enfileiramento: se ele falhar, o reenvio do Telegram ainda tem o botão para responder.
  responderBotao(resultado.mensagem.callbackQueryId, deps);
  return nova ? 'enfileirada' : 'duplicada';
}

/** Para o spinner do botão. Melhor esforço, sem esperar: a resposta de verdade vem pela fila. */
function responderBotao(id: string | undefined, deps: DepsDoTelegram, texto?: string): void {
  if (id === undefined || deps.api === undefined) return;
  deps.api
    .chamar('answerCallbackQuery', {
      callback_query_id: id,
      ...(texto === undefined ? {} : { text: texto }),
    })
    .catch((erro: unknown) => {
      deps.logger.warn({ erro: resumoDoErro(erro) }, 'answerCallbackQuery falhou');
    });
}
