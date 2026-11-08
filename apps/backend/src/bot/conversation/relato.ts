/**
 * História 2.5 · Relatar e ver se já existe pauta parecida (RF-B01, RF-B02).
 *
 *   REPORT_ASK_TEXT ──(bloco citado no relato)──────────────┐
 *        │                                                  ▼
 *        └──(não citou)──▶ REPORT_ASK_BLOCK ──▶ REPORT_PICK_SIMILAR ──▶ "É essa"  → apoio (2.7)
 *                          lista de blocos       lista: até 3 pautas  └▶ "É outro" → pauta nova (2.6)
 *
 * O relato fica cifrado nos dados da conversa (`relatoCifrado`), nunca em claro: a tabela
 * `conversa` guarda o passo de cada telefone por 24h, e o relato é texto livre, que pode ter nome,
 * e-mail ou telefone. Quando a pessoa escolhe "É outro problema", `relatoCifrado` e `blocoId`
 * continuam nos dados para a 2.6 aproveitar como descrição e lugar da pauta nova.
 */
import {
  buscarPautasParecidas,
  listarBlocos,
  palavrasDe,
  termosDaBusca,
  type BlocoParaRelato,
} from '@lumens/dominio';
import type { Db } from '@lumens/db';
import { z } from 'zod';
import type { DataPatch, Segredo, StepHandler, StepResult } from './handlers';
import { lista, type MensagemDeLista } from './resposta';
import { NEW_TITLE_TEXT, normalize } from './texto';

export const REPORT_PROMPT_TEXT =
  'Descreva o problema que você encontrou. Se alguém já te mandou o relato, pode encaminhar a mensagem aqui.';
export const REPORT_TOO_SHORT_TEXT =
  'Conte um pouco mais: o que aconteceu e onde? Ex.: "o bebedouro do bloco 18 está quebrado".';
export const BLOCK_QUESTION_TEXT = 'Em que bloco é o problema?';
export const BLOCK_NOT_FOUND_TEXT = 'Não achei esse bloco. Escolha um na lista.';
export const SIMILAR_LIST_TEXT =
  'Achei pautas abertas parecidas com o seu relato. Se uma delas for o mesmo problema, apoie a que já existe: pauta com mais apoio tem mais força.';
export const PICK_AGAIN_TEXT = 'Não entendi. Escolha uma pauta da lista ou "É outro problema".';
export const YES_NO_TEXT = 'Responda *sim* para criar uma pauta nova ou *não* para voltar ao menu.';
export const NEW_FROM_REPORT_TEXT = 'Certo, vamos criar uma pauta nova com o seu relato.';
export const NO_SIMILAR_TEXT = `Não encontrei pauta aberta parecida com o seu relato. Quer criar uma pauta nova com ele?\n${YES_NO_TEXT}`;
export const NOTHING_CREATED_TEXT = 'Tudo bem, não criei nada.';
export const REPORT_LOST_TEXT =
  'Não consegui recuperar o seu relato. Escolha 1 no menu para relatar de novo.';

/** Linha da lista de blocos para quem não sabe ou fala do campus inteiro. */
export const CAMPUS_ROW_ID = 'bloco:campus';
/** Linha que leva à pauta nova. */
export const OTHER_ROW_ID = 'outro';
const BLOCK_ROW_PREFIX = 'bloco:';
const PAUTA_ROW_PREFIX = 'pauta:';

const YES = new Set(['sim', 's', 'quero', 'criar', 'pode']);
const NO = new Set(['nao', 'n', 'nao quero']);
const OTHER = new Set([
  'outro',
  'outra',
  'e outro problema',
  'outro problema',
  'nenhuma',
  'nenhum',
]);
const CAMPUS = new Set(['campus', 'todo o campus', 'nao sei', 'nenhum', 'outro']);

const parecidaSchema = z.object({ id: z.string(), titulo: z.string(), descricao: z.string() });
type Parecida = z.infer<typeof parecidaSchema>;

/** O que os passos do relato guardam na conversa. Validado: o dado pode ser de outra versão. */
const dadosSchema = z.object({
  relatoCifrado: z.string().optional(),
  /** `null` = todo o campus / não sabe. */
  blocoId: z.string().nullable().optional(),
  parecidas: z.array(parecidaSchema).optional(),
});

function dadosDoRelato(data: unknown): z.infer<typeof dadosSchema> {
  const lidos = dadosSchema.safeParse(data);
  return lidos.success ? lidos.data : {};
}

/** Tira os dados do relato da conversa quando o fluxo acaba sem pauta nova. */
const LIMPAR: DataPatch = { relatoCifrado: undefined, blocoId: undefined, parecidas: undefined };

/** "Bloco 18 (fictício)" → "bloco 18": o nome como alguém escreveria. */
function nomeComparavel(nome: string): string {
  return palavrasDe(nome.replace(/\([^)]*\)/g, '')).join(' ');
}

/**
 * O bloco que o relato cita pelo nome inteiro ("bebedouro do bloco 18 quebrado"). Só quando é um
 * só: com dois ou nenhum, pergunta. Nome inteiro e palavra inteira, para "bloco 1" não casar com
 * "bloco 18".
 */
export function blocoCitado(
  relato: string,
  blocos: readonly BlocoParaRelato[],
): BlocoParaRelato | undefined {
  const texto = ` ${palavrasDe(relato).join(' ')} `;
  const citados = blocos.filter((b) => {
    const nome = nomeComparavel(b.nome);
    return nome !== '' && texto.includes(` ${nome} `);
  });
  return citados.length === 1 ? citados[0] : undefined;
}

/**
 * O bloco que a pessoa escolheu: a linha da lista, ou o nome digitado — inteiro ("Bloco de
 * Artes") ou um pedaço que só um bloco tem ("artes", "18"). `null` é o campus inteiro;
 * `undefined`, que não deu para saber.
 */
export function blocoEscolhido(
  resposta: string,
  blocos: readonly BlocoParaRelato[],
): { blocoId: string | null } | undefined {
  const bruta = resposta.trim();
  if (bruta === CAMPUS_ROW_ID) return { blocoId: null };
  if (bruta.startsWith(BLOCK_ROW_PREFIX)) {
    const id = bruta.slice(BLOCK_ROW_PREFIX.length);
    return blocos.some((b) => b.id === id) ? { blocoId: id } : undefined;
  }

  const digitado = palavrasDe(bruta).join(' ');
  if (digitado === '') return undefined;
  if (CAMPUS.has(digitado)) return { blocoId: null };
  const exato = blocos.find(
    (b) => nomeComparavel(b.nome) === digitado || palavrasDe(b.slug).join(' ') === digitado,
  );
  if (exato) return { blocoId: exato.id };
  const contem = blocos.filter((b) => ` ${nomeComparavel(b.nome)} `.includes(` ${digitado} `));
  const [unico] = contem;
  return contem.length === 1 && unico ? { blocoId: unico.id } : undefined;
}

/** Lista de blocos. Cabem 9 e a linha do campus; com mais, a pessoa pode digitar o nome. */
export function listaDeBlocos(blocos: readonly BlocoParaRelato[]): MensagemDeLista {
  const cabem = blocos.slice(0, 9);
  const corpo =
    cabem.length < blocos.length
      ? `${BLOCK_QUESTION_TEXT} Se o seu não está na lista, escreva o nome dele.`
      : BLOCK_QUESTION_TEXT;
  return lista({
    corpo,
    botao: 'Escolher bloco',
    linhas: [
      ...cabem.map((b) => ({ id: `${BLOCK_ROW_PREFIX}${b.id}`, titulo: b.nome })),
      { id: CAMPUS_ROW_ID, titulo: 'Todo o campus / não sei' },
    ],
  });
}

/** Até 3 pautas e "É outro problema". Título e descrição já cortados por `lista()`. */
export function listaDeParecidas(parecidas: readonly Parecida[]): MensagemDeLista {
  return lista({
    corpo: SIMILAR_LIST_TEXT,
    botao: 'Ver pautas',
    linhas: [
      ...parecidas.map((p) => ({
        id: `${PAUTA_ROW_PREFIX}${p.id}`,
        titulo: p.titulo,
        descricao: p.descricao,
      })),
      { id: OTHER_ROW_ID, titulo: 'É outro problema', descricao: 'Criar uma pauta nova' },
    ],
  });
}

/** Busca as parecidas e mostra a lista, ou oferece pauta nova quando não há nenhuma. */
async function mostrarParecidas(
  db: Db,
  relato: string,
  blocoId: string | null,
  data: DataPatch,
): Promise<StepResult> {
  const achadas = await buscarPautasParecidas(db, { relato, blocoId });
  const parecidas: Parecida[] = achadas.map(({ id, titulo, descricao }) => ({
    id,
    titulo,
    descricao,
  }));
  return {
    next: 'REPORT_PICK_SIMILAR',
    data: { ...data, blocoId, parecidas },
    replies: [parecidas.length > 0 ? listaDeParecidas(parecidas) : NO_SIMILAR_TEXT],
  };
}

export const reportAskText: StepHandler = async ({ input, db, segredo }) => {
  const relato = input.text.trim();
  // Sem termo útil ("oi", "ta ruim aqui") a busca não tem o que procurar.
  if (termosDaBusca(relato).length === 0) {
    return { next: 'REPORT_ASK_TEXT', replies: [REPORT_TOO_SHORT_TEXT] };
  }

  const data: DataPatch = { relatoCifrado: segredo.cifrar(relato), parecidas: undefined };
  const blocos = await listarBlocos(db);
  const citado = blocoCitado(relato, blocos);
  if (citado || blocos.length === 0) return mostrarParecidas(db, relato, citado?.id ?? null, data);
  return { next: 'REPORT_ASK_BLOCK', data, replies: [listaDeBlocos(blocos)] };
};

export const reportAskBlock: StepHandler = async ({ state, input, db, segredo }) => {
  const blocos = await listarBlocos(db);
  const escolha = blocoEscolhido(input.text, blocos);
  if (escolha === undefined) {
    return { next: 'REPORT_ASK_BLOCK', replies: [BLOCK_NOT_FOUND_TEXT, listaDeBlocos(blocos)] };
  }

  const { relatoCifrado } = dadosDoRelato(state.data);
  const relato = relatoCifrado === undefined ? undefined : decifrado(segredo, relatoCifrado);
  // Chave trocada ou dado de outra versão: melhor pedir de novo que buscar com nada.
  if (relato === undefined) return { next: 'MENU', data: LIMPAR, replies: [REPORT_LOST_TEXT] };
  return mostrarParecidas(db, relato, escolha.blocoId, {});
};

function decifrado(segredo: Segredo, cifrado: string): string | undefined {
  try {
    return segredo.decifrar(cifrado);
  } catch {
    return undefined;
  }
}

/** A pauta que a pessoa escolheu: a linha da lista, o número dela ou o título digitado. */
function pautaEscolhida(resposta: string, parecidas: readonly Parecida[]): Parecida | undefined {
  const bruta = resposta.trim();
  if (bruta.startsWith(PAUTA_ROW_PREFIX)) {
    return parecidas.find((p) => p.id === bruta.slice(PAUTA_ROW_PREFIX.length));
  }
  const texto = normalize(bruta);
  const numero = /^\d+$/.test(texto) ? Number(texto) : NaN;
  if (numero >= 1 && numero <= parecidas.length) return parecidas[numero - 1];
  return parecidas.find((p) => normalize(p.titulo) === texto);
}

const paraPautaNova: StepResult = {
  next: 'NEW_ASK_TITLE',
  // `relatoCifrado` e `blocoId` ficam para a 2.6; a lista já não serve.
  data: { parecidas: undefined },
  replies: [NEW_FROM_REPORT_TEXT, NEW_TITLE_TEXT],
};

export const reportPickSimilar: StepHandler = ({ state, input }) => {
  const parecidas = dadosDoRelato(state.data).parecidas ?? [];
  const texto = normalize(input.text);

  if (parecidas.length === 0) {
    if (YES.has(texto) || input.text.trim() === OTHER_ROW_ID) return paraPautaNova;
    if (NO.has(texto)) return { next: 'MENU', data: LIMPAR, replies: [NOTHING_CREATED_TEXT] };
    return { next: 'REPORT_PICK_SIMILAR', replies: [YES_NO_TEXT] };
  }

  if (input.text.trim() === OTHER_ROW_ID || OTHER.has(texto)) return paraPautaNova;

  const escolhida = pautaEscolhida(input.text, parecidas);
  if (escolhida === undefined) {
    return { next: 'REPORT_PICK_SIMILAR', replies: [PICK_AGAIN_TEXT, listaDeParecidas(parecidas)] };
  }
  // TODO(2.7): registrar o apoio a `escolhida.id` aqui, na mesma transação da conversa.
  return {
    next: 'MENU',
    data: LIMPAR,
    replies: [
      `[REPORT_PICK_SIMILAR — em construção, história 2.7] Você escolheu: ${escolhida.titulo}.`,
    ],
  };
};
