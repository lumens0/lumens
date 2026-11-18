import type { Db } from '@lumens/db';
import type { ServicoDeEmail } from '../../email/codigo';
import type { ServicoDeRespostas } from '../../fotos/resposta-pdf';
import type { ServicoDeFotos } from '../../fotos/servico';
import { supportAskPhoto, supportAskReport } from './apoio';
import { temCadastro } from './estudante';
import {
  entrarNaPautaNova,
  newAskDescription,
  newAskPhoto,
  newAskPlace,
  newAskTitle,
} from './nova-pauta';
import {
  entrarEmMinhasPautas,
  ownerPaths,
  ownerPickPauta,
  proposalAskPeople,
} from './minhas-pautas';
import { proposalAskText } from './proposta';
import { leaveConfirm, PRIVACY_NOTICE_TEXT } from './privacidade';
import { ownerAskProtocol, ownerAskProtocolDate } from './protocolo-falabr';
import { ownerSendResponse } from './resposta-oficial';
import {
  newPickSimilar,
  reportAskBlock,
  reportAskText,
  reportPickSimilar,
  REPORT_PROMPT_TEXT,
} from './relato';
import type { Resposta } from './resposta';
import type { ConversationData, ConversationState } from './store';
import type { Step } from './steps';
import { normalize } from './texto';
import { entrarNaVerificacao, verifyAskCode, verifyAskCourse, verifyAskEmail } from './verificacao';

export { normalize } from './texto';
export { PHOTO_ASK_TEXT, PHOTO_RECEIVED_TEXT } from './nova-pauta';

/** Mensagem recebida. Foto chega com `text` vazio e o `image`. */
export interface IncomingMessage {
  text: string;
  /** Foto enviada pela pessoa. `id` é o id da mídia na Meta. */
  image?: { id: string; mimeType: string };
  /** Arquivo enviado pela pessoa (o PDF da resposta oficial, 3.6). Chega com `text` vazio. */
  document?: { id: string; mimeType: string };
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
  /** Baixa e guarda o PDF da resposta oficial (3.6). Sem ele, o arquivo é recusado com aviso. */
  respostas?: ServicoDeRespostas;
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
  /** 5.7: em vez de gravar o passo, apaga a conversa (a pessoa saiu ou não tinha cadastro). */
  apagarConversa?: boolean;
}

/** Pode ser síncrono; os que consultam o banco (2.5 em diante) são assíncronos. */
export type StepHandler = (ctx: StepContext) => StepResult | Promise<StepResult>;
export type HandlerRegistry = Record<Step, StepHandler>;

export const GREETING_TEXT = 'Olá! Eu sou o Lumens, o canal para melhorar o campus.';
/** SCRUM-333: quem tem cadastro e volta depois de a conversa expirar. */
export const WELCOME_BACK_TEXT = 'Oi de novo! Que bom ter você de volta ao Lumens.';
export const MENU_PERGUNTA = 'O que você quer fazer?';

/**
 * As opções do menu principal, num lugar só: o texto numerado (WhatsApp, Evolution) e o teclado do
 * Telegram (SCRUM-324) saem daqui. O `id` é o que a pessoa digita e o que o botão manda.
 */
export const OPCOES_DO_MENU = [
  { id: '1', titulo: 'Relatar problema' },
  { id: '2', titulo: 'Nova pauta' },
  { id: '3', titulo: 'Verificar e-mail' },
  { id: '4', titulo: 'Minhas pautas' },
] as const;

export const MENU_TEXT = [MENU_PERGUNTA, ...OPCOES_DO_MENU.map((o) => `${o.id} ${o.titulo}`)].join(
  '\n',
);

export const MENU_INVALID_TEXT = 'Não entendi. Responda com 1, 2, 3 ou 4.';

/**
 * Sem conversa guardada (primeiro contato ou conversa expirada em 24 h).
 *
 * SCRUM-333: uma opção do menu ("2", "nova pauta"...) é atendida direto, em vez de ser trocada pela
 * saudação: quem volta depois de 24 h não perde a mensagem. O aviso de privacidade completo (5.7) é
 * só de quem não tem cadastro; quem tem recebe uma saudação curta. No primeiro contato de verdade, o
 * router põe o aviso antes da resposta, mesmo quando ela é uma opção do menu.
 */
const greeting: StepHandler = async (ctx) => {
  if (opcaoDoMenu(ctx.input.text) !== undefined) return menu(ctx);
  if (await temCadastro(ctx.db, ctx.phoneHmac)) {
    return { next: 'MENU', replies: [WELCOME_BACK_TEXT, MENU_TEXT] };
  }
  return { next: 'MENU', replies: [GREETING_TEXT, PRIVACY_NOTICE_TEXT, MENU_TEXT] };
};

/** Opções do menu que só mudam de passo. A "2", a "3" e a "4" consultam o banco: veja `menu`. */
const MENU_OPTIONS: Record<string, { next: Step; reply: string }> = {
  '1': { next: 'REPORT_ASK_TEXT', reply: REPORT_PROMPT_TEXT },
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

/** A opção do menu ("1" a "4") que o texto escolhe, pelo número ou pelo nome; `undefined` se nenhuma. */
function opcaoDoMenu(texto: string): string | undefined {
  const t = normalize(texto);
  const escolha = MENU_ALIASES[t] ?? t;
  return ['1', '2', '3', '4'].includes(escolha) ? escolha : undefined;
}

function menu(ctx: StepContext): StepResult | Promise<StepResult> {
  const escolha = opcaoDoMenu(ctx.input.text);
  if (escolha === '2') return entrarNaPautaNova(ctx);
  if (escolha === '3') return entrarNaVerificacao(ctx);
  if (escolha === '4') return entrarEmMinhasPautas(ctx);
  const opt = escolha === undefined ? undefined : MENU_OPTIONS[escolha];
  if (!opt) return { next: 'MENU', replies: [MENU_INVALID_TEXT, MENU_TEXT] };
  return { next: opt.next, replies: [opt.reply] };
}

export const defaultHandlers: HandlerRegistry = {
  GREETING: greeting,
  MENU: menu,
  VERIFY_ASK_EMAIL: verifyAskEmail,
  VERIFY_ASK_CODE: verifyAskCode,
  VERIFY_ASK_COURSE: verifyAskCourse,
  REPORT_ASK_TEXT: reportAskText,
  REPORT_ASK_BLOCK: reportAskBlock,
  REPORT_PICK_SIMILAR: reportPickSimilar,
  NEW_ASK_TITLE: newAskTitle,
  NEW_ASK_PLACE: newAskPlace,
  NEW_PICK_SIMILAR: newPickSimilar,
  NEW_ASK_DESCRIPTION: newAskDescription,
  NEW_ASK_PHOTO: newAskPhoto,
  OWNER_PICK_PAUTA: ownerPickPauta,
  OWNER_PATHS: ownerPaths,
  PROPOSAL_ASK_TEXT: proposalAskText,
  PROPOSAL_ASK_PEOPLE: proposalAskPeople,
  LEAVE_CONFIRM: leaveConfirm,
  OWNER_ASK_PROTOCOL: ownerAskProtocol,
  OWNER_ASK_PROTOCOL_DATE: ownerAskProtocolDate,
  OWNER_SEND_RESPONSE: ownerSendResponse,
  SUPPORT_ASK_REPORT: supportAskReport,
  SUPPORT_ASK_PHOTO: supportAskPhoto,
};
