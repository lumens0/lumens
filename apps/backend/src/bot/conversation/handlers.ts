import type { Db } from '@lumens/db';
import type { ServicoDeEmail } from '../../email/codigo';
import type { ServicoDeFotos } from '../../fotos/servico';
import {
  entrarNaPautaNova,
  newAskDescription,
  newAskPhoto,
  newAskPlace,
  newAskTitle,
} from './nova-pauta';
import { entrarEmMinhasPautas, ownerPaths, ownerPickPauta } from './minhas-pautas';
import { reportAskBlock, reportAskText, reportPickSimilar, REPORT_PROMPT_TEXT } from './relato';
import type { Resposta } from './resposta';
import type { ConversationData, ConversationState } from './store';
import { TRANSITIONS, type Step } from './steps';
import { normalize } from './texto';
import { EMAIL_QUESTION_TEXT, verifyAskCode, verifyAskEmail } from './verificacao';

export { normalize } from './texto';
export { PHOTO_ASK_TEXT, PHOTO_RECEIVED_TEXT } from './nova-pauta';

/** Mensagem recebida. Foto chega com `text` vazio e o `image`. */
export interface IncomingMessage {
  text: string;
  /** Foto enviada pela pessoa. `id` é o id da mídia na Meta. */
  image?: { id: string; mimeType: string };
}

/** Cifra o que a pessoa escreveu antes de guardar nos dados da conversa (CHAVE_CIFRA). */
export interface Segredo {
  cifrar(texto: string): string;
  /** Lança se o conteúdo não decifrar (outra chave, dado alterado). */
  decifrar(cifrado: string): string;
}

export interface StepContext {
  /** Estado atual (passo + dados). Para usuário novo, step = GREETING e data = {}. */
  state: Pick<ConversationState, 'step' | 'data'>;
  input: IncomingMessage;
  /** `hashPhone` de quem escreveu: acha o estudante verificado (2.4) para a pauta nova (2.6). */
  phoneHmac: string;
  /** Baixa, limpa e guarda a foto da pauta nova (2.6). Sem ele, a foto é recusada com aviso. */
  fotos?: ServicoDeFotos;
  /** Envia o código de verificação (2.4). Sem ele, o código não sai e a pessoa é avisada. */
  email?: ServicoDeEmail;
  /** O telefone cifrado do job (CHAVE_CIFRA): o cadastro do estudante guarda assim (2.4). */
  phoneCifrado?: string;
  /** HMAC com a CHAVE_HMAC, o mesmo do `phoneHmac`: busca o e-mail sem guardá-lo em claro (2.4). */
  hmac?: (valor: string) => string;
  /** A transação da mensagem: o que o handler ler ou gravar confirma junto com a conversa. */
  db: Db;
  segredo: Segredo;
}

/** Patch raso aplicado sobre state.data: chave com undefined remove. */
export type DataPatch = { [K in keyof ConversationData]?: ConversationData[K] | undefined };

export interface StepResult {
  next: Step;
  data?: DataPatch;
  replies: Resposta[];
}

/** Pode ser síncrono; os que consultam o banco (2.5 em diante) são assíncronos. */
export type StepHandler = (ctx: StepContext) => StepResult | Promise<StepResult>;
export type HandlerRegistry = Record<Step, StepHandler>;

export const GREETING_TEXT = 'Olá! Eu sou o Lumens, o canal para melhorar o campus.';
export const MENU_TEXT = [
  'O que você quer fazer?',
  '1 Relatar problema',
  '2 Nova pauta',
  '3 Verificar e-mail',
  '4 Minhas pautas',
].join('\n');

export const MENU_INVALID_TEXT = 'Não entendi. Responda com 1, 2, 3 ou 4.';

const greeting: StepHandler = () => ({ next: 'MENU', replies: [GREETING_TEXT, MENU_TEXT] });

/** Opções do menu que só mudam de passo. A "2" e a "4" consultam o banco: veja `menu`. */
const MENU_OPTIONS: Record<string, { next: Step; reply: string }> = {
  '1': { next: 'REPORT_ASK_TEXT', reply: REPORT_PROMPT_TEXT },
  '3': { next: 'VERIFY_ASK_EMAIL', reply: EMAIL_QUESTION_TEXT },
};
const MENU_ALIASES: Record<string, string> = {
  relatar: '1',
  'relatar problema': '1',
  'nova pauta': '2',
  pauta: '2',
  verificar: '3',
  'verificar e-mail': '3',
  'verificar email': '3',
  'minhas pautas': '4',
  caminhos: '4',
};

const menu: StepHandler = (ctx) => {
  const t = normalize(ctx.input.text);
  const escolha = MENU_ALIASES[t] ?? t;
  if (escolha === '2') return entrarNaPautaNova(ctx);
  if (escolha === '4') return entrarEmMinhasPautas(ctx);
  const opt = MENU_OPTIONS[escolha];
  if (!opt) return { next: 'MENU', replies: [MENU_INVALID_TEXT, MENU_TEXT] };
  return { next: opt.next, replies: [opt.reply] };
};

/**
 * Placeholder: avança para o primeiro próximo passo permitido. Não ecoa a entrada: a resposta
 * vai para a fila e para o log, e a entrada pode ser o e-mail ou o relato da pessoa.
 */
function placeholder(step: Step, story: string): StepHandler {
  // TODO(story): substituir pelo handler real.
  const next = TRANSITIONS[step][0];
  if (!next) throw new Error(`${step} não tem próximo passo em TRANSITIONS`);
  return () => ({
    next,
    replies: [`[${step} — em construção, história ${story}] Recebi sua mensagem.`],
  });
}

export const defaultHandlers: HandlerRegistry = {
  GREETING: greeting,
  MENU: menu,
  VERIFY_ASK_EMAIL: verifyAskEmail,
  VERIFY_ASK_CODE: verifyAskCode,
  // TODO(2.4): curso (próxima subtask).
  VERIFY_ASK_COURSE: placeholder('VERIFY_ASK_COURSE', '2.4'),
  REPORT_ASK_TEXT: reportAskText,
  REPORT_ASK_BLOCK: reportAskBlock,
  REPORT_PICK_SIMILAR: reportPickSimilar,
  NEW_ASK_TITLE: newAskTitle,
  NEW_ASK_PLACE: newAskPlace,
  NEW_ASK_DESCRIPTION: newAskDescription,
  NEW_ASK_PHOTO: newAskPhoto,
  OWNER_PICK_PAUTA: ownerPickPauta,
  OWNER_PATHS: ownerPaths,
};
