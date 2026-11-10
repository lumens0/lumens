import type { Db } from '@lumens/db';
import type { ServicoDeEmail } from '../../email/codigo';
import type { ServicoDeFotos } from '../../fotos/servico';
import {
  defaultHandlers,
  MENU_TEXT,
  normalize,
  type HandlerRegistry,
  type IncomingMessage,
  type Segredo,
} from './handlers';
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
  handlers?: HandlerRegistry;
}

export const CANCEL_TEXT = 'Ok, cancelei.';
export const NEED_TEXT = 'Recebi a imagem, mas agora preciso de uma resposta em texto.';

/** Passos que sabem o que fazer com uma foto. Nos outros ela não responde à pergunta feita. */
const STEPS_WITH_PHOTO: readonly Step[] = ['GREETING', 'NEW_ASK_PHOTO'];

type GlobalCommand = 'menu' | 'cancelar';

export function parseGlobalCommand(text: string): GlobalCommand | null {
  const t = normalize(text);
  return t === 'menu' || t === 'cancelar' ? t : null;
}

/**
 * Processa uma mensagem e devolve as respostas a enviar. A conversa é achada pelo `phoneHmac`
 * (o `hashPhone` do remetente), que o webhook já calcula e põe no job.
 */
export async function handleIncoming(
  msg: { phoneHmac: string } & IncomingMessage,
  deps: RouterDeps,
): Promise<Resposta[]> {
  const { store, db, segredo } = deps;
  const handlers = deps.handlers ?? defaultHandlers;
  const { phoneHmac } = msg;
  await store.lock(phoneHmac);
  const current = await store.get(phoneHmac);

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

  const state: { step: Step; data: ConversationData } = current
    ? { step: current.step, data: current.data }
    : { step: 'GREETING', data: {} };

  if (msg.image && !STEPS_WITH_PHOTO.includes(state.step)) return [NEED_TEXT];

  const input: IncomingMessage = msg.image
    ? { text: msg.text, image: msg.image }
    : { text: msg.text };
  const result = await handlers[state.step]({
    state,
    input,
    db,
    segredo,
    phoneHmac,
    ...(deps.fotos ? { fotos: deps.fotos } : {}),
    ...(deps.email ? { email: deps.email } : {}),
  });
  assertTransition(state.step, result.next);

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
