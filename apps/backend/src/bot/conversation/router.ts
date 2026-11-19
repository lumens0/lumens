import type { Db } from '@lumens/db';
import type { ServicoDeEmail } from '../../email/codigo';
import type { ServicoDeRespostas } from '../../fotos/resposta-pdf';
import type { ServicoDeFotos } from '../../fotos/servico';
import {
  defaultHandlers,
  MENU_DICA_TEXT,
  MENU_PRINCIPAL,
  RESPOSTA_LONGA,
  ehMenuPrincipal,
  normalize,
  type HandlerRegistry,
  type IncomingMessage,
  type Segredo,
  type StepContext,
} from './handlers';
import { executarComandoDoSite, parseComandoDoSite } from './comandos-do-site';
import { entradaDeConferencia, responderConferencia } from './conferencia';
import { removerFotosSoltas } from './fotos-temporarias';
import { pedirSaida, PRIVACY_NOTICE_TEXT } from './privacidade';
import type { Resposta } from './resposta';
import { temCadastro } from './estudante';
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
  /**
   * 5.7: chamado quando a conversa é apagada por causa do `sair`. O worker usa para tirar o
   * telefone das filas do bot na mesma transação (`apagarFilasDoTelefone`).
   */
  aoSair?: () => void;
}

export const CANCEL_TEXT = 'Ok, cancelei.';
/** No passo da foto o relato já está gravado: "cancelar" só deixa a foto de lado. */
export const CANCEL_PHOTO_TEXT = 'Ok, parei por aqui. O seu relato já foi enviado.';
/** Depois de três respostas seguidas que não saíram da pergunta, a pessoa ganha uma saída clara. */
export const SAIDA_DO_PASSO_TEXT =
  'Parece que está difícil por aqui. Mande *menu* para voltar ao início ou *cancelar* para desistir.';
const TENTATIVAS_ATE_OFERECER_SAIDA = 3;
/**
 * Passos em que ficar no mesmo passo não quer dizer erro: o menu, o código do e-mail (tem as
 * próprias tentativas e avisos, e o reenvio também fica no passo) e os caminhos da pauta, onde cada
 * botão (abrir um caminho, pedir o texto, propor) devolve a pessoa ao mesmo passo com o estado novo.
 */
const SEM_SAIDA_AUTOMATICA: readonly Step[] = ['MENU', 'VERIFY_ASK_CODE', 'OWNER_PATHS'];

export const NEED_TEXT = 'Recebi a imagem, mas agora preciso de uma resposta em texto.';

/**
 * Passos que sabem o que fazer com uma foto. Nos outros ela não responde à pergunta feita. O do
 * PDF da resposta oficial recebe a foto só para explicar que precisa do arquivo (SCRUM-307).
 */
const STEPS_WITH_PHOTO: readonly Step[] = [
  'GREETING',
  'NEW_ASK_PHOTO',
  'SUPPORT_ASK_PHOTO',
  'OWNER_SEND_RESPONSE',
];

export const NEED_TEXT_FOR_FILE = 'Recebi o arquivo, mas agora preciso de uma resposta em texto.';

/** Passos que pedem uma foto: um arquivo neles recebe `PHOTO_AS_FILE_TEXT` (SCRUM-307). */
const PHOTO_AS_FILE_STEPS: readonly Step[] = ['NEW_ASK_PHOTO', 'SUPPORT_ASK_PHOTO'];

export const PHOTO_AS_FILE_TEXT =
  'Recebi um arquivo, mas aqui preciso de uma foto. Mande a imagem como foto (não como documento), ou responda *pular*.';

/** O único passo que recebe arquivo é o do PDF da resposta oficial (3.6). */
const STEPS_WITH_DOCUMENT: readonly Step[] = [
  'OWNER_SEND_RESPONSE',
  // SCRUM-307: nos passos da foto, o arquivo é quase sempre a foto mandada como documento.
  ...PHOTO_AS_FILE_STEPS,
];

type GlobalCommand = 'menu' | 'cancelar' | 'sair';

const VOLTAR_AO_MENU = new Set([
  'menu principal',
  'voltar ao menu',
  'voltar ao menu principal',
  'voltar ao inicio',
  'ir para o menu',
  'quero o menu',
  'inicio',
]);
const DESISTIR = new Set(['cancela', 'desistir', 'desisto', 'quero cancelar']);

export function parseGlobalCommand(text: string): GlobalCommand | null {
  const t = normalize(text);
  if (t === 'menu' || t === 'cancelar' || t === 'sair') return t;
  // Do jeito que a pessoa escreveria sem decorar o comando (frase inteira, para não pegar relato).
  if (VOLTAR_AO_MENU.has(t)) return 'menu';
  if (DESISTIR.has(t)) return 'cancelar';
  return null;
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
  // SCRUM-333: conversa expirada de quem tem cadastro não é primeiro contato (já viu o aviso).
  const primeiroContato = current === null && !(await temCadastro(deps.db, phoneHmac));
  // As fotos da pauta nova só viram relato no fim. Se a conversa deixou de guardá-las sem criar a
  // pauta (menu, cancelar, sair, comando do site, conversa vencida, criação recusada), os arquivos
  // ficariam órfãos no storage: apaga os que não são de nenhum relato.
  const fotosAntes = await store.fotoChavesDaConversa(phoneHmac);
  const respostas = await responder(msg, deps, current);
  if (fotosAntes.length > 0) {
    const fotosDepois = new Set(await store.fotoChavesDaConversa(phoneHmac));
    await removerFotosSoltas(
      deps.db,
      deps.fotos,
      fotosAntes.filter((c) => !fotosDepois.has(c)),
    );
  }
  return comAviso(primeiroContato, respostas);
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
    const relatoJaEnviado = current?.step === 'SUPPORT_ASK_PHOTO';
    return [relatoJaEnviado ? CANCEL_PHOTO_TEXT : CANCEL_TEXT, MENU_PRINCIPAL];
  }
  if (cmd === 'menu') {
    // 'menu' recomeça mas preserva o comando pendente.
    const pending = current?.data.pendingCommand;
    await store.save(phoneHmac, 'MENU', pending ? { pendingCommand: pending } : {});
    return [MENU_PRINCIPAL];
  }
  const ctxBase = { input: { text: msg.text }, db, segredo, phoneHmac };
  // SCRUM-334: na confirmação, o 'sair' repetido é a resposta, e não um pedido novo de saída.
  if (cmd === 'sair' && current?.step !== 'LEAVE_CONFIRM') {
    // 5.7: 'sair' larga o fluxo atual. Sem cadastro, a conversa já é apagada aqui.
    const result = await pedirSaida({ ...ctxBase, state: { step: 'GREETING', data: {} } });
    if (result.apagarConversa) {
      await store.delete(phoneHmac);
      deps.aoSair?.();
    } else await store.save(phoneHmac, result.next, {});
    return result.replies;
  }

  const state: { step: Step; data: ConversationData } = current
    ? { step: current.step, data: current.data }
    : { step: 'GREETING', data: {} };

  // SCRUM-293: a resposta à conferência vale em qualquer passo e não mexe na conversa. O payload de
  // um botão de aviso nunca segue para o passo atual.
  const conferencia = msg.image || msg.document ? null : entradaDeConferencia(msg.text, state.step);
  if (conferencia !== null) {
    const resposta = await responderConferencia(db, phoneHmac, conferencia);
    if (resposta !== null) {
      // Sem conversa guardada, o aviso de privacidade vai junto (5.7). Guardar a saudação faz ele
      // sair uma vez só, e não a cada toque. Quem não tem cadastro não deixa conversa guardada.
      if (current === null && resposta.cadastrado) await store.save(phoneHmac, 'GREETING', {});
      return resposta.respostas;
    }
  }

  if (msg.image && !STEPS_WITH_PHOTO.includes(state.step)) return [NEED_TEXT];

  if (msg.document && !STEPS_WITH_DOCUMENT.includes(state.step)) return [NEED_TEXT_FOR_FILE];

  if (msg.document && PHOTO_AS_FILE_STEPS.includes(state.step)) return [PHOTO_AS_FILE_TEXT];

  const input: IncomingMessage = msg.image
    ? { text: msg.text, image: msg.image }
    : msg.document
      ? { text: msg.text, document: msg.document }
      : { text: msg.text };
  const ctx: StepContext = {
    ...ctxBase,
    state,
    input,
    ...(deps.fotos ? { fotos: deps.fotos } : {}),
    ...(deps.email ? { email: deps.email } : {}),
    ...(deps.hmac ? { hmac: deps.hmac } : {}),
    ...(msg.phoneCifrado === undefined ? {} : { phoneCifrado: msg.phoneCifrado }),
    ...(deps.respostas ? { respostas: deps.respostas } : {}),
  };
  // 2.8 e 3.5: os comandos dos botões do site ("apoiar", "ajudar", "nova pauta", "cuidar") valem em
  // qualquer passo e largam o fluxo atual, como os comandos globais.
  const comando = msg.image || msg.document ? null : parseComandoDoSite(msg.text);
  const executado = comando === null ? null : await executarComandoDoSite(ctx, comando);
  // SCRUM-307: só um aviso; o passo e os dados ficam como estavam.
  if (executado !== null && 'avisoNoPasso' in executado) return [executado.avisoNoPasso];
  const doSite = executado;
  const global = doSite !== null;
  const result = doSite ?? (await handlers[state.step](ctx));
  if (!global) assertTransition(state.step, result.next);

  // 5.7: quem saiu (ou não tinha cadastro) não deixa conversa guardada com o HMAC do telefone.
  if (result.apagarConversa) {
    await store.delete(phoneHmac);
    deps.aoSair?.();
    return result.replies;
  }

  // Quantas vezes seguidas a conversa ficou na mesma pergunta (resposta que não serviu).
  const repetiu =
    !global && result.next === state.step && !SEM_SAIDA_AUTOMATICA.includes(state.step);
  const tentativas = repetiu ? (state.data.tentativasNoPasso ?? 0) + 1 : 0;
  // Aplica o patch: chave com valor undefined sai dos dados.
  const data = Object.fromEntries(
    Object.entries({
      ...(global ? {} : state.data),
      ...result.data,
      tentativasNoPasso: tentativas === 0 ? undefined : tentativas,
    }).filter(([, v]) => v !== undefined),
  ) as ConversationData;
  await store.save(phoneHmac, result.next, data);
  if (tentativas >= TENTATIVAS_ATE_OFERECER_SAIDA) {
    return [...result.replies, SAIDA_DO_PASSO_TEXT];
  }
  // Fim de um fluxo: a pessoa volta ao menu e precisa ver as opções, ou a próxima mensagem dela
  // cai num "Não entendi".
  const flowEnded = result.next === 'MENU' && (state.step !== 'MENU' || global);
  if (flowEnded && !result.replies.some(ehMenuPrincipal)) {
    const ultima = result.replies.at(-1);
    const longa = typeof ultima === 'string' && ultima.length > RESPOSTA_LONGA;
    return [...result.replies, longa ? MENU_DICA_TEXT : MENU_PRINCIPAL];
  }
  return result.replies;
}
