/**
 * Saída do Telegram: as `Resposta`s da conversa viram `sendMessage`.
 *
 * - texto ──────────▶ uma mensagem (ou várias, se passar de 4096 caracteres);
 * - botões ─────────▶ o corpo com um botão inline por linha, `callback_data` = id do botão;
 * - lista ──────────▶ o corpo, as descrições das linhas como texto, e um botão por linha.
 *
 * O toque no botão volta como `callback_query` com o id, e a conversa o recebe como texto — o mesmo
 * que o `button_reply`/`list_reply` do WhatsApp.
 *
 * Sem `parse_mode`: nada do texto é interpretado pelo Telegram. O `*negrito*` das respostas (feito
 * para o WhatsApp) vira `entities` (veja `formatacao.ts`).
 */
import { decifrar, type Chaves } from '../../cripto/cifra';
import { resumoDoErro, type Logger } from '../../infra/logger';
import type { Resposta } from '../conversation/resposta';
import { respostasDoJob, type OutgoingReplies, type ReplySender } from '../worker';
import { classificarErro, ErroDaApiDoTelegram, type ApiDoTelegram } from './api';
import { BOTAO_CONTATO_TEXT } from './contato';
import { cortes, dividirFormatado, negritoDoWhatsapp, type Entidade } from './formatacao';

/** Limite do `text` do `sendMessage`. */
export const LIMITE_DO_TEXTO = 4096;
/** Limite do `callback_data` de um botão inline, em bytes UTF-8. */
export const LIMITE_DO_CALLBACK_BYTES = 64;

export interface BotaoInline {
  text: string;
  callback_data: string;
}

/** Botão que abre um link (o "Ver a pauta" dos avisos). */
export interface BotaoDeLink {
  text: string;
  url: string;
}

/** Teclado de resposta com o botão que manda o contato da própria conta (SCRUM-267). */
export interface TecladoDeContato {
  keyboard: { text: string; request_contact: true }[][];
  one_time_keyboard: true;
  resize_keyboard: true;
}

export interface EnvioDeMensagem {
  chat_id: number;
  text: string;
  /** Só quando há negrito: sem `parse_mode`, é assim que o Telegram formata. */
  entities?: Entidade[];
  reply_markup?: { inline_keyboard: (BotaoInline | BotaoDeLink)[][] };
}

/** Um `sendMessage` que pode levar, no lugar do teclado inline, o de resposta do contato. */
export type EnvioComTeclado = Omit<EnvioDeMensagem, 'reply_markup'> & {
  reply_markup?: EnvioDeMensagem['reply_markup'] | TecladoDeContato | { remove_keyboard: true };
};

export const TECLADO_DE_CONTATO: TecladoDeContato = {
  keyboard: [[{ text: BOTAO_CONTATO_TEXT, request_contact: true }]],
  one_time_keyboard: true,
  resize_keyboard: true,
};

/**
 * Põe o teclado de resposta do job (pedir o contato ou recolhê-lo) na última mensagem que não tem
 * teclado inline: uma mensagem só leva um `reply_markup`. Pura.
 */
export function comTeclado(
  envios: EnvioDeMensagem[],
  teclado: OutgoingReplies['teclado'],
): EnvioComTeclado[] {
  if (teclado === undefined) return envios;
  const indice = envios.findLastIndex((e) => e.reply_markup === undefined);
  if (indice === -1) return envios;
  const marcacao =
    teclado === 'pedirContato' ? TECLADO_DE_CONTATO : { remove_keyboard: true as const };
  return envios.map((e, i) => (i === indice ? { ...e, reply_markup: marcacao } : e));
}

/**
 * Corta o texto em pedaços de até `limite` (unidades UTF-16, como o Telegram conta), de preferência
 * numa quebra de linha, sem partir emoji ao meio.
 */
export function dividirTexto(texto: string, limite: number = LIMITE_DO_TEXTO): string[] {
  return cortes(texto, limite).map(({ inicio, fim }) => texto.slice(inicio, fim));
}

/**
 * Os `sendMessage` de um texto do bot: negrito em `entities`, dividido no limite, e o teclado (se
 * houver) na última parte, logo acima de onde a pessoa vai tocar.
 */
export function mensagensDoTexto(
  texto: string,
  chatId: number,
  teclado?: (BotaoInline | BotaoDeLink)[][],
): EnvioDeMensagem[] {
  const partes = dividirFormatado(negritoDoWhatsapp(texto), LIMITE_DO_TEXTO);
  return partes.map((parte, i) => ({
    chat_id: chatId,
    text: parte.text,
    ...(parte.entities.length > 0 ? { entities: parte.entities } : {}),
    ...(teclado !== undefined && i === partes.length - 1
      ? { reply_markup: { inline_keyboard: teclado } }
      : {}),
  }));
}

/** Um botão de resposta, conferido contra o limite do `callback_data`. Lança se não couber. */
export function botaoDeResposta(id: string, titulo: string): BotaoInline {
  if (Buffer.byteLength(id, 'utf8') > LIMITE_DO_CALLBACK_BYTES) {
    // O Telegram recusaria a mensagem inteira (400), e a pessoa ficaria sem resposta.
    throw new Error(
      `id de botão com ${String(Buffer.byteLength(id, 'utf8'))} bytes não cabe no callback_data do Telegram (máximo ${String(LIMITE_DO_CALLBACK_BYTES)}).`,
    );
  }
  return { text: titulo, callback_data: id };
}

function botao(id: string, titulo: string): BotaoInline[] {
  return [botaoDeResposta(id, titulo)];
}

/** Monta os `sendMessage` de uma resposta. Pura. Lança se um id não cabe no `callback_data`. */
export function paraTelegram(resposta: Resposta, chatId: number): EnvioDeMensagem[] {
  let texto: string;
  let teclado: BotaoInline[][] | undefined;
  if (typeof resposta === 'string') {
    texto = resposta;
  } else if (resposta.tipo === 'botoes') {
    texto = resposta.corpo;
    teclado = resposta.botoes.map((b) => botao(b.id, b.titulo));
  } else {
    const descricoes = resposta.linhas
      .filter((l) => l.descricao !== undefined)
      .map((l) => `• ${l.titulo}: ${l.descricao ?? ''}`);
    texto =
      descricoes.length === 0 ? resposta.corpo : [resposta.corpo, '', ...descricoes].join('\n');
    teclado = resposta.linhas.map((l) => botao(l.id, l.titulo));
  }
  return mensagensDoTexto(texto, chatId, teclado);
}

export interface OpcoesDoSender {
  api: Pick<ApiDoTelegram, 'chamar'>;
  chaves: Chaves;
  logger: Logger;
  /** Quantas vezes espera um 429 antes de devolver o job ao retry do pg-boss. */
  esperasMaximas?: number;
  /** `retry_after` maior que isto não é esperado aqui: o job volta ao retry. */
  esperaMaximaSegundos?: number;
  /** Trocável nos testes. */
  esperar?: (ms: number) => Promise<void>;
}

const esperarPadrao = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Entrega as respostas de um job, em ordem. Erro permanente (a pessoa bloqueou o bot) descarta o
 * resto sem lançar: o retry só repetiria a recusa até a fila de mortas. 429 espera o `retry_after`
 * e tenta a mesma mensagem de novo. O resto lança e volta pelo retry — que reenvia o job inteiro,
 * então uma parte já entregue pode chegar duas vezes (o mesmo "pelo menos uma vez" da fila).
 */
export function telegramSender({
  api,
  chaves,
  logger,
  esperasMaximas = 3,
  esperaMaximaSegundos = 60,
  esperar = esperarPadrao,
}: OpcoesDoSender): ReplySender {
  return {
    async send(message) {
      // O destino é o chat, não o telefone: o `phoneCifrado` é o telefone da pessoa.
      if (message.chatCifrado === undefined) throw new Error('Job do Telegram sem o chat id.');
      const chatId = Number(decifrar(message.chatCifrado, chaves.cifra));
      const envios = comTeclado(
        respostasDoJob(message, chaves).flatMap((r) => paraTelegram(r, chatId)),
        message.teclado,
      );
      const log = logger.child({ conversa: message.phoneHmac.slice(0, 12) });
      for (const envio of envios) {
        for (let esperas = 0; ; esperas++) {
          try {
            await api.chamar('sendMessage', envio);
            break;
          } catch (erro) {
            const classe = classificarErro(erro);
            if (classe === 'permanente') {
              log.warn(
                { erro: resumoDoErro(erro) },
                'Telegram recusou de vez (bloqueio ou chat inexistente); respostas descartadas',
              );
              return;
            }
            const segundos = erro instanceof ErroDaApiDoTelegram ? erro.esperarSegundos : undefined;
            if (
              classe === 'esperar' &&
              esperas < esperasMaximas &&
              (segundos ?? 1) <= esperaMaximaSegundos
            ) {
              log.warn({ esperaS: segundos ?? 1 }, 'Telegram pediu para esperar (429)');
              await esperar((segundos ?? 1) * 1000);
              continue;
            }
            throw erro;
          }
        }
      }
    },
  };
}
