import type { Db } from '@lumens/db';
import type { ServicoDeEmail } from '../../email/codigo';
import type { ServicoDeRespostas } from '../../fotos/resposta-pdf';
import type { ServicoDeFotos } from '../../fotos/servico';
import {
  defaultHandlers,
  MENU_TEXT,
  normalize,
  type HandlerRegistry,
  type IncomingMessage,
  type Segredo,
} from './handlers';
import { pedirSaida, PRIVACY_NOTICE_TEXT } from './privacidade';
import type { Resposta } from './resposta';
import { assertTransition, type Step } from './steps';
import type { ConversationData, ConversationStore } from './store';

export interface RouterDeps {
  store: ConversationStore;
  /** A mesma conexão do `store` (a transação da mensagem), para os handlers que leem o banco. */
  db: Db;
  segredo: Segredo;
  fotos?: ServicoDeFotos;
  email?: ServicoDeEmail;
  /** HMAC com a CHAVE_HMAC, para o e-mail do estudante (2.4). */
  hmac?: (valor: string) => string;
  respostas?: ServicoDeRespostas;
  handlers?: HandlerRegistry;
}

export const CANCEL_TEXT = 'Ok, cancelei.';
export const NEED_TEXT = 'Recebi a imagem, mas agora preciso de uma resposta em texto.';

/** Passos que sabem o que fazer com uma foto. Nos outros ela não responde à pergunta feita. */
const STEPS_WITH_PHOTO: readonly Step[] = ['GREETING', 'NEW_ASK_PHOTO'];

export const NEED_TEXT_FOR_FILE = 'Recebi o arquivo, mas agora preciso de uma resposta em texto.';

/** O único passo que recebe arquivo: o PDF da resposta oficial (3.6). */
const STEPS_WITH_DOCUMENT: readonly Step[] = ['OWNER_SEND_RESPONSE'];

type GlobalCommand = 'menu' | 'cancelar' | 'sair';

export function parseGlobalCommand(text: string): GlobalCommand | null {
  const t = normalize(text);
  return t === 'menu' || t === 'cancelar' || t === 'sair' ? t : null;
}

/**
 * 5.7: o primeiro contato (sem conversa guardada) sempre leva o aviso de privacidade, inclusive
 * quando a primeira mensagem é um comando global e não passa pela saudação.
 */
function comAviso(primeiroContato: boolean, replies: Resposta[]): Resposta[] {
  if (!primeiroContato || replies.includes(PRIVACY_NOTICE_TEXT)) return replies;
  return [PRIVACY_NOTICE_TEXT, ...replies];
}

/**
 * Processa uma mensagem e devolve as respostas a enviar. A conversa é achada pelo `phoneHmac`
 * (o `hashPhone` do remetente), que o webhook já calcula e põe no job.
 */
export async function handleIncoming(
  msg: { phoneHmac: string; phoneCifrado?: string } & IncomingMessage,
  deps: RouterDeps,
): Promise<Resposta[]> {
  const { store } = deps;
  const { phoneHmac } = msg;
  await store.lock(phoneHmac);
  const current = await store.get(phoneHmac);
  const primeiroContato = current === null;
  return comAviso(primeiroContato, await responder(msg, deps, current));
}

async function responder(
  msg: { phoneHmac: string; phoneCifrado?: string } & IncomingMessage,
  deps: RouterDeps,
  current: Awaited<ReturnType<ConversationStore['get']>>,
): Promise<Resposta[]> {
  const { store, db, segredo } = deps;
  const handlers = deps.handlers ?? defaultHandlers;
  const { phoneHmac } = msg;

  const cmd = parseGlobalCommand(msg.text);
  if (cmd === 'cancelar') {
    // 'cancelar' limpa tudo, inclusive pendingCommand.
    await store.save(phoneHmac, 'MENU', {});
    return [CANCEL_TEXT, MENU_TEXT];
  }
  if (cmd === 'menu') {
    // 'menu' recomeça mas preserva o comando pendente.
    const pending = current?.data.pendingCommand;
    await store.save(phoneHmac, 'MENU', pending ? { pendingCommand: pending } : {});
    return [MENU_TEXT];
  }
  const ctxBase = { input: { text: msg.text }, db, segredo, phoneHmac };
  if (cmd === 'sair') {
    // 5.7: 'sair' larga o fluxo atual. Sem cadastro, a conversa já é apagada aqui.
    const result = await pedirSaida({ ...ctxBase, state: { step: 'GREETING', data: {} } });
    if (result.apagarConversa) await store.delete(phoneHmac);
    else await store.save(phoneHmac, result.next, {});
    return result.replies;
  }

  const state: { step: Step; data: ConversationData } = current
    ? { step: current.step, data: current.data }
    : { step: 'GREETING', data: {} };

  if (msg.image && !STEPS_WITH_PHOTO.includes(state.step)) return [NEED_TEXT];

  if (msg.document && !STEPS_WITH_DOCUMENT.includes(state.step)) return [NEED_TEXT_FOR_FILE];

  const input: IncomingMessage = msg.image
    ? { text: msg.text, image: msg.image }
    : msg.document
      ? { text: msg.text, document: msg.document }
      : { text: msg.text };
  const result = await handlers[state.step]({
    ...ctxBase,
    state,
    input,
    ...(deps.fotos ? { fotos: deps.fotos } : {}),
    ...(deps.email ? { email: deps.email } : {}),
    ...(deps.hmac ? { hmac: deps.hmac } : {}),
    ...(msg.phoneCifrado === undefined ? {} : { phoneCifrado: msg.phoneCifrado }),
    ...(deps.respostas ? { respostas: deps.respostas } : {}),
  });
  assertTransition(state.step, result.next);

  // 5.7: quem saiu (ou não tinha cadastro) não deixa conversa guardada com o HMAC do telefone.
  if (result.apagarConversa) {
    await store.delete(phoneHmac);
    return result.replies;
  }

  // Aplica o patch: chave com valor undefined sai dos dados.
  const data = Object.fromEntries(
    Object.entries({ ...state.data, ...result.data }).filter(([, v]) => v !== undefined),
  ) as ConversationData;
  await store.save(phoneHmac, result.next, data);
  // Fim de um fluxo: a pessoa volta ao menu e precisa ver as opções, ou a próxima mensagem dela
  // cai num "Não entendi".
  const flowEnded = result.next === 'MENU' && state.step !== 'MENU';
  if (flowEnded && !result.replies.includes(MENU_TEXT)) return [...result.replies, MENU_TEXT];
  return result.replies;
}
