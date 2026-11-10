/**
 * História 3.3 · Owner escolhe os caminhos (RF-B12, RN07).
 *
 *   "4 Minhas pautas" ──▶ uma pauta só? ──sim──────────────┐
 *                            │ não                         ▼
 *                            ▼                         OWNER_PATHS: estado dos caminhos
 *                      OWNER_PICK_PAUTA (lista) ──▶    [Abrir Fala.BR] [Abrir comunidade]
 *                                                      [Texto do Fala.BR] [Registrar protocolo]
 *                                                      [Menu]
 *                                                          │ abre um
 *                                                          └─▶ confirma e mostra o estado de novo
 *
 * Com o Fala.BR aberto e ainda sem protocolo, o owner pode pedir o texto pronto da manifestação
 * (3.4): o bot manda logo depois de abrir o caminho e sempre que o botão for tocado. E pode
 * registrar o protocolo que o Fala.BR devolveu (`protocolo-falabr.ts`).
 *
 * Fala.BR e comunidade ficam disponíveis a qualquer momento, inclusive antes da meta (RN05), e um
 * não bloqueia o outro (RN07): cada um tem o seu botão enquanto não estiver aberto. Abrir caminho
 * não muda o status da pauta (quem leva a `cobrando` é o protocolo, RN08).
 */
import { eq, pautas, type Db } from '@lumens/db';
import {
  STATUS_COM_CAMINHOS,
  abrirCaminho,
  caminhosDaPauta,
  pautasDoOwner,
  prepararParaProtocolar,
  textoFalaBrDaPauta,
  type CaminhoDaPauta,
  type PautaDoOwner,
} from '@lumens/dominio';
import { z } from 'zod';
import { estudanteVerificado } from './estudante';
import { pedirProtocolo } from './protocolo-falabr';
import type { DataPatch, StepContext, StepHandler, StepResult } from './handlers';
import { LIMITES_DOS_BOTOES, botoes, lista, type BotaoDeResposta, type Resposta } from './resposta';
import { normalize } from './texto';

type TipoEscolhido = 'falabr' | 'comunidade';

export const NOT_OWNER_TEXT =
  'Você ainda não cuida de nenhuma pauta aprovada. Pautas que você criou aparecem aqui depois que a curadoria aprova. Para criar uma, escolha 2 no menu.';
export const PICK_PAUTA_TEXT = 'De qual pauta você quer ver os caminhos?';
export const PAUTA_NOT_FOUND_TEXT = 'Não achei essa pauta. Escolha uma na lista.';
export const PICK_PATH_AGAIN_TEXT = 'Escolha um caminho nos botões ou responda *menu*.';
export const LOST_OWNER_TEXT =
  'Você não é mais owner desta pauta, então não pode abrir caminhos nela.';
export const PAUTA_CLOSED_TEXT = 'Esta pauta não aceita caminhos novos agora.';
export const DATA_LOST_TEXT =
  'Não consegui recuperar a pauta escolhida. Escolha 4 no menu de novo.';
export const ALL_OPEN_TEXT = 'Os dois caminhos já estão abertos nesta pauta.';
export const INDEPENDENT_TEXT =
  'Os caminhos são independentes: abra um, o outro ou os dois, quando quiser, mesmo antes da meta.';
export const NEXT_STEP_TEXT = 'O que você quer fazer agora?';
export const FALABR_TEXT_INTRO =
  'Este é o texto da manifestação. Copie a próxima mensagem inteira e cole no campo de descrição do Fala.BR:';
export const FALABR_TEXT_BLOCKED =
  'Não consegui montar um texto sem dado pessoal para esta pauta, e ele não pode ir assim para o Fala.BR (RN08). Fale com a curadoria antes de protocolar.';

/** Quantos trechos saíram do texto por serem dado pessoal (e-mail, telefone, matrícula). */
export function removedText(quantos: number): string {
  const trechos = quantos === 1 ? '1 trecho que era' : `${String(quantos)} trechos que eram`;
  return `Tirei do texto ${trechos} dado pessoal (e-mail, telefone ou matrícula). No lugar ficou [removido]. O Fala.BR é público, e o texto não pode levar dado de ninguém (RN08).`;
}

/** Possíveis nomes de pessoa que ficaram no texto, para o owner conferir. */
export function suspectText(trechos: readonly string[]): string {
  const lista = trechos.map((t) => `“${t}”`).join(', ');
  return `Confira antes de colar: ${lista} pode ser nome de pessoa. Se for, apague do texto antes de protocolar.`;
}

export const OPENED_TEXT: Record<TipoEscolhido, string> = {
  falabr:
    'Caminho Fala.BR aberto ✅\nAgora registre a manifestação em https://falabr.cgu.gov.br. Guarde o número do protocolo: é com ele que a pauta passa a ser cobrada.',
  comunidade:
    'Caminho comunidade aberto ✅\nA pauta passa a mostrar no site que a comunidade está se mobilizando.',
};

export const NOME_DO_CAMINHO: Record<TipoEscolhido, string> = {
  falabr: 'Fala.BR',
  comunidade: 'Comunidade',
};

const TITULO_DO_BOTAO: Record<TipoEscolhido, string> = {
  falabr: 'Abrir Fala.BR',
  comunidade: 'Abrir comunidade',
};

export function alreadyOpenText(tipo: TipoEscolhido): string {
  return `O caminho ${NOME_DO_CAMINHO[tipo]} já está aberto nesta pauta.`;
}

const PAUTA_ROW_PREFIX = 'pauta:';
const PATH_BUTTON_PREFIX = 'caminho:';
export const TEXT_BUTTON_ID = 'texto:falabr';
export const PROTOCOL_BUTTON_ID = 'protocolo:falabr';
const MENU_BUTTON: BotaoDeResposta = { id: 'menu', titulo: 'Voltar ao menu' };
const TIPOS: readonly TipoEscolhido[] = ['falabr', 'comunidade'];

/** O que os passos guardam na conversa. Validado: o dado pode ser de outra versão. */
const dadosSchema = z.object({ pautaId: z.uuid().optional() });

function pautaIdDaConversa(data: unknown): string | undefined {
  const lidos = dadosSchema.safeParse(data);
  return lidos.success ? lidos.data.pautaId : undefined;
}

/** Tira da conversa tudo o que os passos do owner guardam, inclusive os do protocolo. */
export const LIMPAR: DataPatch = { pautaId: undefined, caminhoId: undefined, protocolo: undefined };

const dataBR = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio' });

/** "2026-12-01" → "01/12/2026". */
function dataDoPrazo(prazo: string): string {
  const [ano, mes, dia] = prazo.split('-');
  return `${dia ?? ''}/${mes ?? ''}/${ano ?? ''}`;
}

function linhaDoCaminho(caminho: CaminhoDaPauta): string {
  const aberto = `aberto em ${dataBR.format(caminho.abertoEm)}`;
  if (caminho.protocolo === null) return `${aberto}, ainda sem protocolo`;
  const prazo = caminho.prazo === null ? '' : `, prazo ${dataDoPrazo(caminho.prazo)}`;
  return `${aberto}, protocolo ${caminho.protocolo}${prazo}`;
}

/**
 * O que o owner pode fazer agora: abrir o caminho que falta e, com o Fala.BR aberto e sem
 * protocolo, pedir o texto da manifestação.
 */
function acoesDaPauta(existentes: readonly CaminhoDaPauta[], faltam: readonly TipoEscolhido[]) {
  const acoes: BotaoDeResposta[] = faltam.map((tipo) => ({
    id: `${PATH_BUTTON_PREFIX}${tipo}`,
    titulo: TITULO_DO_BOTAO[tipo],
  }));
  if (existentes.some((c) => c.tipo === 'falabr' && c.protocolo === null)) {
    acoes.push({ id: TEXT_BUTTON_ID, titulo: 'Texto do Fala.BR' });
    acoes.push({ id: PROTOCOL_BUTTON_ID, titulo: 'Registrar protocolo' });
  }
  return acoes;
}

/** Até 3 opções cabem em botões; mais que isso vira lista, que o WhatsApp aceita até 10. */
function opcoes(corpo: string, acoes: readonly BotaoDeResposta[]): Resposta {
  const todas = [...acoes, MENU_BUTTON];
  if (todas.length <= LIMITES_DOS_BOTOES.botoes) return botoes({ corpo, botoes: todas });
  return lista({
    corpo,
    botao: 'Ver opções',
    linhas: todas.map((a) => ({ id: a.id, titulo: a.titulo })),
  });
}

/**
 * O estado dos dois caminhos da pauta e as opções do que ainda dá para fazer. Sem nenhuma, só o
 * texto: não há mais o que escolher.
 */
export async function estadoDosCaminhos(
  db: Db,
  pauta: { id: string; titulo: string },
): Promise<{ resposta: Resposta; acoes: BotaoDeResposta[] }> {
  const existentes = await caminhosDaPauta(db, pauta.id);
  const linhas = [`*${pauta.titulo}*`, ''];
  const faltam: TipoEscolhido[] = [];
  for (const tipo of TIPOS) {
    const doTipo = existentes.filter((c) => c.tipo === tipo);
    if (doTipo.length === 0) {
      faltam.push(tipo);
      linhas.push(`• ${NOME_DO_CAMINHO[tipo]}: não aberto`);
    }
    for (const caminho of doTipo) {
      linhas.push(`• ${NOME_DO_CAMINHO[tipo]}: ${linhaDoCaminho(caminho)}`);
    }
  }

  const acoes = acoesDaPauta(existentes, faltam);
  if (acoes.length === 0) {
    return { resposta: [...linhas, '', ALL_OPEN_TEXT].join('\n'), acoes };
  }
  const fecho = faltam.length > 0 ? INDEPENDENT_TEXT : NEXT_STEP_TEXT;
  return { resposta: opcoes([...linhas, '', fecho].join('\n'), acoes), acoes };
}

export async function mostrarCaminhos(
  db: Db,
  pauta: { id: string; titulo: string },
  antes: Resposta[] = [],
): Promise<StepResult> {
  const { resposta, acoes } = await estadoDosCaminhos(db, pauta);
  if (acoes.length === 0) return { next: 'MENU', data: LIMPAR, replies: [...antes, resposta] };
  return { next: 'OWNER_PATHS', data: { pautaId: pauta.id }, replies: [...antes, resposta] };
}

function listaDePautas(pautas: readonly PautaDoOwner[]): Resposta {
  return lista({
    corpo: PICK_PAUTA_TEXT,
    botao: 'Ver pautas',
    // A lista do WhatsApp cabe 10 linhas: as 10 pautas mais novas.
    linhas: pautas
      .slice(0, 10)
      .map((p) => ({ id: `${PAUTA_ROW_PREFIX}${p.id}`, titulo: p.titulo })),
  });
}

/** "4 Minhas pautas" no menu. */
export async function entrarEmMinhasPautas({
  db,
  phoneHmac,
}: Pick<StepContext, 'db' | 'phoneHmac'>): Promise<StepResult> {
  const estudanteId = await estudanteVerificado(db, phoneHmac);
  const pautas = estudanteId === undefined ? [] : await pautasDoOwner(db, estudanteId);
  const [unica] = pautas;
  if (unica === undefined) return { next: 'MENU', replies: [NOT_OWNER_TEXT] };
  if (pautas.length === 1) return mostrarCaminhos(db, unica);
  return { next: 'OWNER_PICK_PAUTA', replies: [listaDePautas(pautas)] };
}

/** A pauta escolhida: a linha da lista, o número dela ou o título digitado. */
function pautaEscolhida(resposta: string, pautas: readonly PautaDoOwner[]) {
  const bruta = resposta.trim();
  if (bruta.startsWith(PAUTA_ROW_PREFIX)) {
    return pautas.find((p) => p.id === bruta.slice(PAUTA_ROW_PREFIX.length));
  }
  const texto = normalize(bruta);
  const numero = /^\d+$/.test(texto) ? Number(texto) : NaN;
  if (numero >= 1 && numero <= Math.min(pautas.length, 10)) return pautas[numero - 1];
  return pautas.find((p) => normalize(p.titulo) === texto);
}

export const ownerPickPauta: StepHandler = async ({ input, db, phoneHmac }) => {
  const estudanteId = await estudanteVerificado(db, phoneHmac);
  if (estudanteId === undefined) return { next: 'MENU', data: LIMPAR, replies: [NOT_OWNER_TEXT] };
  const pautas = await pautasDoOwner(db, estudanteId);
  const escolhida = pautaEscolhida(input.text, pautas);
  if (escolhida === undefined) {
    if (pautas.length === 0) return { next: 'MENU', data: LIMPAR, replies: [NOT_OWNER_TEXT] };
    return { next: 'OWNER_PICK_PAUTA', replies: [PAUTA_NOT_FOUND_TEXT, listaDePautas(pautas)] };
  }
  return mostrarCaminhos(db, escolhida);
};

/** O caminho pedido: o botão, ou o nome digitado ("fala br", "Fala.BR", "comunidade"). */
function caminhoPedido(resposta: string): TipoEscolhido | undefined {
  const bruta = resposta.trim();
  if (bruta.startsWith(PATH_BUTTON_PREFIX)) {
    const tipo = bruta.slice(PATH_BUTTON_PREFIX.length);
    return TIPOS.find((t) => t === tipo);
  }
  const letras = normalize(bruta)
    .replace(/^abrir\s+/, '')
    .replace(/[^a-z]/g, '');
  if (letras === 'falabr') return 'falabr';
  if (letras === 'comunidade') return 'comunidade';
  return undefined;
}

export type PautaConferida =
  | { ok: true; pauta: { id: string; titulo: string }; estudanteId: string }
  | { ok: false; resultado: StepResult };

/**
 * Relê a pauta da conversa e confere que quem escreve ainda é owner dela. A cada mensagem, porque
 * entre uma e outra a pauta pode ter fechado, ou a pessoa ter deixado de ser owner.
 */
export async function conferirPautaDoOwner({
  state,
  db,
  phoneHmac,
}: Pick<StepContext, 'state' | 'db' | 'phoneHmac'>): Promise<PautaConferida> {
  const sair = (texto: string): PautaConferida => ({
    ok: false,
    resultado: { next: 'MENU', data: LIMPAR, replies: [texto] },
  });
  const pautaId = pautaIdDaConversa(state.data);
  if (pautaId === undefined) return sair(DATA_LOST_TEXT);
  const [pauta] = await db
    .select({ id: pautas.id, titulo: pautas.titulo, status: pautas.status })
    .from(pautas)
    .where(eq(pautas.id, pautaId));
  if (pauta === undefined) return sair(DATA_LOST_TEXT);
  if (!STATUS_COM_CAMINHOS.includes(pauta.status)) return sair(PAUTA_CLOSED_TEXT);
  const estudanteId = await estudanteVerificado(db, phoneHmac);
  const doOwner = estudanteId === undefined ? [] : await pautasDoOwner(db, estudanteId);
  if (estudanteId === undefined || !doOwner.some((p) => p.id === pauta.id)) {
    return sair(LOST_OWNER_TEXT);
  }
  return { ok: true, pauta, estudanteId };
}

export const ownerPaths: StepHandler = async (ctx) => {
  const { input, db } = ctx;
  const conferida = await conferirPautaDoOwner(ctx);
  if (!conferida.ok) return conferida.resultado;
  const { pauta, estudanteId } = conferida;

  if (textoPedido(input.text)) {
    return mostrarCaminhos(db, pauta, await textoDaManifestacao(db, pauta.id));
  }
  if (protocoloPedido(input.text)) return pedirProtocolo(db, pauta);

  const tipo = caminhoPedido(input.text);
  if (tipo === undefined) return mostrarCaminhos(db, pauta, [PICK_PATH_AGAIN_TEXT]);

  // O domínio aceita dois caminhos do mesmo tipo (manifestações a órgãos diferentes). Pelo bot,
  // um toque repetido no botão não abre outro: só mostra que já está aberto.
  const existentes = await caminhosDaPauta(db, pauta.id);
  if (existentes.some((c) => c.tipo === tipo)) {
    return mostrarCaminhos(db, pauta, [alreadyOpenText(tipo)]);
  }

  const resultado = await db.transaction((tx) =>
    abrirCaminho(tx, { pautaId: pauta.id, tipo, porEstudanteId: estudanteId }),
  );
  if (!resultado.aberto) {
    const texto = resultado.motivo === 'nao_e_owner' ? LOST_OWNER_TEXT : PAUTA_CLOSED_TEXT;
    return { next: 'MENU', data: LIMPAR, replies: [texto] };
  }
  const depois = tipo === 'falabr' ? await textoDaManifestacao(db, pauta.id) : [];
  return mostrarCaminhos(db, pauta, [OPENED_TEXT[tipo], ...depois]);
};

/** O botão "Registrar protocolo", ou o pedido digitado ("protocolo", "registrar protocolo"). */
function protocoloPedido(resposta: string): boolean {
  if (resposta.trim() === PROTOCOL_BUTTON_ID) return true;
  const letras = normalize(resposta).replace(/[^a-z]/g, '');
  return letras === 'protocolo' || letras === 'registrarprotocolo';
}

/** O botão "Texto do Fala.BR", ou o pedido digitado ("texto", "texto do fala br"). */
function textoPedido(resposta: string): boolean {
  if (resposta.trim() === TEXT_BUTTON_ID) return true;
  const letras = normalize(resposta).replace(/[^a-z]/g, '');
  return letras === 'texto' || letras === 'textodofalabr' || letras === 'textofalabr';
}

/**
 * O texto da manifestação: a explicação, o que o anti-nome mexeu (RN08) e, por último e sozinho, o
 * texto, para o owner copiar a mensagem inteira sem levar junto o que não é para colar.
 *
 * Dado pessoal certo já sai trocado por `[removido]`; possível nome de pessoa fica no texto, com o
 * aviso para conferir. Se ainda assim o texto não passar, ele não é entregue.
 */
async function textoDaManifestacao(db: Db, pautaId: string): Promise<Resposta[]> {
  const gerado = await textoFalaBrDaPauta(db, pautaId);
  if (gerado === undefined) return [DATA_LOST_TEXT];

  const pronto = prepararParaProtocolar(gerado);
  if (!pronto.liberado) return [FALABR_TEXT_BLOCKED];

  const avisos: Resposta[] = [];
  if (pronto.removidos.length > 0) avisos.push(removedText(pronto.removidos.length));
  const suspeitos = [...new Set(pronto.suspeitos.map((s) => s.trecho))].slice(0, 3);
  if (suspeitos.length > 0) avisos.push(suspectText(suspeitos));
  return [FALABR_TEXT_INTRO, ...avisos, pronto.texto];
}
