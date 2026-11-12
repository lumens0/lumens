/**
 * Entrada do Telegram: do `Update` da Bot API até o mesmo job da fila que o webhook da Meta gera.
 *
 *   Update ─▶ zod (só o que usamos) ─▶ mensagemDoUpdate ─▶ dedup + chat ─▶ fila da conversa
 *            chat privado, sem bot      (pura)             (uma transação)
 *
 * A identidade da pessoa é o telefone, a mesma do WhatsApp (SCRUM-267). O update só traz o chat
 * id, então o chat é procurado em `chat_telegram` pelo HMAC de `tg:<chat_id>`:
 *
 *   - chat com telefone ─▶ job com o `hashPhone` do telefone: a mesma conversa e o mesmo
 *     estudante do WhatsApp, e o chat id cifrado para a resposta;
 *   - chat sem telefone ─▶ nada vai para a conversa. A resposta pede o contato (teclado com
 *     `request_contact`); um texto (o `/start` de um link do site, ou a primeira mensagem) fica
 *     guardado e roda depois que o contato for aceito;
 *   - contato da própria conta ─▶ liga o chat ao telefone, tira o teclado e manda à conversa o
 *     texto guardado (ou `menu`). Contato de outra pessoa é recusado, e o pedido se repete.
 *
 * O dedup é o HMAC de `tg:<update_id>`, na mesma tabela do wamid, e entra na mesma transação.
 *
 * A conversa não sabe de onde veio a mensagem: botão vira o texto do id, `/start <payload>` vira o
 * comando que o link do site manda no WhatsApp.
 */
import type { Tx } from '@lumens/db';
import {
  chatTelegramDe,
  guardarComandoPendente,
  PRIORIDADE,
  vincularChatTelegram,
  type ChatTelegram,
} from '@lumens/dominio';
import { z } from 'zod';
import { cifrar, decifrar, hmacHex, type Chaves } from '../../cripto/cifra';
import { resumoDoErro } from '../../infra/logger';
import { JOBS } from '../../infra/queue';
import { hashPhone } from '../conversation/phone';
import type { Resposta } from '../conversation/resposta';
import {
  cifrarConteudo,
  marcarProcessada,
  paraJsonb,
  type ConteudoMensagem,
  type IncomingMessageJob,
  type ProcessDeps,
} from '../webhook/process';
import type { OutgoingReplies } from '../worker';
import type { ApiDoTelegram } from './api';
import {
  CONTATO_ACEITO_TEXT,
  CONTATO_ALHEIO_TEXT,
  CONTATO_ILEGIVEL_TEXT,
  normalizarTelefone,
  PEDIR_CONTATO_TEXT,
} from './contato';

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
  // O telefone não passa pelo `paraJsonb`: vira HMAC e cifra antes de ir para qualquer lugar.
  contact: z
    .object({ phone_number: z.string().min(1), user_id: z.number().int().optional() })
    .optional(),
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

/** Contato compartilhado. O telefone vai como veio; normalize com `normalizarTelefone`. */
export interface ContatoDoTelegram {
  updateId: number;
  chatId: number;
  timestamp: string;
  telefone: string;
  /** O contato é da própria conta de quem mandou (`contact.user_id` = `from.id`). */
  proprio: boolean;
}

export type ResultadoDoUpdate =
  | { tipo: 'mensagem'; mensagem: MensagemDoTelegram }
  | { tipo: 'contato'; contato: ContatoDoTelegram }
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
  if (message.contact) {
    const dono = message.contact.user_id;
    return {
      tipo: 'contato',
      contato: {
        ...base,
        telefone: message.contact.phone_number,
        // Sem `user_id` o cartão não diz de quem é: pode ser um contato salvo na agenda.
        proprio: dono !== undefined && message.from !== undefined && dono === message.from.id,
      },
    };
  }
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

/**
 * A chave do chat em `chat_telegram`: o HMAC de `tg:<chat_id>`. O prefixo impede que um chat id
 * coincida com o HMAC de um telefone de mesmos dígitos.
 */
export function chaveDoChat(chatId: number, chaves: Chaves): string {
  return hmacHex(`tg:${String(chatId)}`, chaves.hmac);
}

const dedupDoUpdate = (updateId: number, chaves: Chaves) =>
  hmacHex(`tg:${String(updateId)}`, chaves.hmac);

/** Telefone de um chat que já compartilhou o contato. */
type ChatComTelefone = ChatTelegram & { telefoneHmac: string; telefoneCifrado: string };

const temTelefone = (chat: ChatTelegram | undefined): chat is ChatComTelefone =>
  chat !== undefined && chat.telefoneHmac !== null && chat.telefoneCifrado !== null;

/** O job da conversa: chaveado pelo telefone (o mesmo do WhatsApp), respondido no chat. */
export function jobDoTelegram(
  mensagem: Pick<MensagemDoTelegram, 'updateId' | 'type' | 'timestamp' | 'conteudo'>,
  chat: Pick<ChatComTelefone, 'chatCifrado' | 'telefoneHmac' | 'telefoneCifrado'>,
  chaves: Chaves,
): IncomingMessageJob {
  return {
    canal: 'telegram',
    wamidHmac: dedupDoUpdate(mensagem.updateId, chaves),
    wamidCifrado: cifrar(String(mensagem.updateId), chaves.cifra),
    phoneHmac: chat.telefoneHmac,
    phoneCifrado: chat.telefoneCifrado,
    phoneNumberId: PHONE_NUMBER_ID_TELEGRAM,
    type: mensagem.type,
    timestamp: mensagem.timestamp,
    contentCifrado: cifrarConteudo(mensagem.conteudo, chaves),
    chatCifrado: chat.chatCifrado,
  };
}

export type ResultadoDoTelegram =
  | 'enfileirada'
  | 'duplicada'
  | 'ignorada'
  | 'invalida'
  /** Chat sem telefone: a resposta pede o contato, e nada vai para a conversa. */
  | 'contato_pedido'
  /** Contato aceito: o chat foi ligado ao telefone, e o comando guardado foi para a conversa. */
  | 'contato_aceito'
  /** Contato de outra pessoa, ou ilegível: recusado, com o pedido de novo. */
  | 'contato_recusado';

export interface DepsDoTelegram extends ProcessDeps {
  /** Para o `answerCallbackQuery`. Sem ele, o botão fica girando até o Telegram desistir. */
  api?: Pick<ApiDoTelegram, 'chamar'>;
}

/**
 * Processa um update (do webhook ou do long polling). Lança só se a transação falhar (banco fora):
 * aí o webhook responde 500 e o Telegram reenvia, e o polling não avança o offset. Update fora do
 * formato é ignorado: reenviá-lo não o conserta.
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
  const entrada = resultado.tipo === 'contato' ? resultado.contato : resultado.mensagem;
  const wamidHmac = dedupDoUpdate(entrada.updateId, deps.chaves);
  const desfecho = await deps.db.transaction(async (tx): Promise<ResultadoDoTelegram> => {
    if (!(await marcarProcessada(tx, wamidHmac))) return 'duplicada';
    const chatHmac = chaveDoChat(entrada.chatId, deps.chaves);
    const chat = await chatTelegramDe(tx, chatHmac);
    const chatCifrado = chat?.chatCifrado ?? cifrar(String(entrada.chatId), deps.chaves.cifra);
    const ctx: Contexto = { tx, deps, chatHmac, chatCifrado, wamidHmac };

    if (resultado.tipo === 'contato') return aceitarContato(resultado.contato, chat, ctx);
    const { mensagem } = resultado;
    if (temTelefone(chat)) {
      const job = jobDoTelegram(mensagem, chat, deps.chaves);
      await deps.queue.send(JOBS.incomingMessage, job, tx, { chave: job.phoneHmac });
      return 'enfileirada';
    }
    // Sem telefone, nada vai para a conversa. Só um texto digitado fica guardado: botão antigo,
    // foto e documento não fazem sentido antes de a conversa começar.
    if (mensagem.type === 'text' && mensagem.conteudo.text !== undefined) {
      await guardarComandoPendente(tx, {
        chatHmac,
        chatCifrado,
        comandoCifrado: cifrar(mensagem.conteudo.text.body, deps.chaves.cifra),
      });
    }
    await responder(ctx, [PEDIR_CONTATO_TEXT], 'pedirContato');
    return 'contato_pedido';
  });
  deps.logger
    .child({ mensagem: wamidHmac.slice(0, 12) })
    .info(
      { type: resultado.tipo === 'contato' ? 'contact' : resultado.mensagem.type, desfecho },
      'update do Telegram processado',
    );
  // Depois da transação: se ela falhar, o reenvio do Telegram ainda tem o botão para responder.
  if (resultado.tipo === 'mensagem') responderBotao(resultado.mensagem.callbackQueryId, deps);
  return desfecho;
}

interface Contexto {
  tx: Tx;
  deps: DepsDoTelegram;
  chatHmac: string;
  chatCifrado: string;
  wamidHmac: string;
}

/**
 * Contato da própria conta: liga o chat ao telefone, avisa e tira o teclado, e manda à conversa o
 * comando que esperava (ou `menu`). Daí em diante o chat é a mesma pessoa do WhatsApp.
 */
async function aceitarContato(
  contato: ContatoDoTelegram,
  chat: ChatTelegram | undefined,
  ctx: Contexto,
): Promise<ResultadoDoTelegram> {
  const { tx, deps, chatHmac, chatCifrado } = ctx;
  const telefone = contato.proprio ? normalizarTelefone(contato.telefone) : null;
  if (telefone === null) {
    const recusa = contato.proprio ? CONTATO_ILEGIVEL_TEXT : CONTATO_ALHEIO_TEXT;
    await responder(ctx, [recusa], 'pedirContato');
    return 'contato_recusado';
  }
  const ligacao = {
    chatCifrado,
    telefoneHmac: hashPhone(telefone, deps.chaves.hmac),
    telefoneCifrado: cifrar(telefone, deps.chaves.cifra),
  };
  await vincularChatTelegram(tx, { chatHmac, ...ligacao });
  await responder(ctx, [CONTATO_ACEITO_TEXT], 'tirarTeclado');
  const job = jobDoTelegram(
    {
      updateId: contato.updateId,
      type: 'text',
      timestamp: contato.timestamp,
      conteudo: { text: { body: comandoPendente(chat, deps.chaves) } },
    },
    ligacao,
    deps.chaves,
  );
  await deps.queue.send(JOBS.incomingMessage, job, tx, { chave: job.phoneHmac });
  return 'contato_aceito';
}

/** O texto que esperava o contato; sem ele (ou ilegível), o menu. */
function comandoPendente(chat: ChatTelegram | undefined, chaves: Chaves): string {
  if (chat?.comandoPendenteCifrado == null) return 'menu';
  try {
    return decifrar(chat.comandoPendenteCifrado, chaves.cifra);
  } catch {
    return 'menu';
  }
}

/**
 * Resposta de antes da conversa (o pedido de contato, a confirmação), pela mesma fila das
 * respostas da conversa. O `phoneHmac` é o do chat: só correlaciona o log, porque o telefone ainda
 * pode não existir.
 */
async function responder(
  { tx, deps, chatHmac, chatCifrado, wamidHmac }: Contexto,
  respostas: Resposta[],
  teclado: NonNullable<OutgoingReplies['teclado']>,
): Promise<void> {
  const envio: OutgoingReplies = {
    canal: 'telegram',
    phoneHmac: chatHmac,
    phoneNumberId: PHONE_NUMBER_ID_TELEGRAM,
    wamidHmac,
    repliesCifradas: cifrar(JSON.stringify(respostas), deps.chaves.cifra),
    chatCifrado,
    teclado,
  };
  await deps.queue.send(JOBS.outgoingReplies, envio, tx);
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
