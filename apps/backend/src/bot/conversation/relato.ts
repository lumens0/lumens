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
 * continuam nos dados, e a pauta nova (2.6, `nova-pauta.ts`) usa os dois como descrição e lugar.
 */
import { buscarPautasParecidas, listarBlocos, termosDaBusca } from '@lumens/dominio';
import type { Db } from '@lumens/db';
import { z } from 'zod';
import { BLOCK_NOT_FOUND_TEXT, blocoCitado, blocoEscolhido, listaDeBlocos } from './blocos';
import type { DataPatch, Segredo, StepContext, StepHandler, StepResult } from './handlers';
import { entrarNaPautaNova } from './nova-pauta';
import { lista, type MensagemDeLista } from './resposta';
import { normalize } from './texto';

// Os testes do relato e quem já importava daqui continuam achando as funções de blocos.
export {
  BLOCK_NOT_FOUND_TEXT,
  BLOCK_QUESTION_TEXT,
  CAMPUS_ROW_ID,
  blocoCitado,
  blocoEscolhido,
  listaDeBlocos,
} from './blocos';

export const REPORT_PROMPT_TEXT =
  'Descreva o problema que você encontrou. Se alguém já te mandou o relato, pode encaminhar a mensagem aqui.';
export const REPORT_TOO_SHORT_TEXT =
  'Conte um pouco mais: o que aconteceu e onde? Ex.: "o bebedouro do bloco 18 está quebrado".';
export const SIMILAR_LIST_TEXT =
  'Achei pautas abertas parecidas com o seu relato. Se uma delas for o mesmo problema, apoie a que já existe: pauta com mais apoio tem mais força.';
export const PICK_AGAIN_TEXT = 'Não entendi. Escolha uma pauta da lista ou "É outro problema".';
export const YES_NO_TEXT = 'Responda *sim* para criar uma pauta nova ou *não* para voltar ao menu.';
export const NEW_FROM_REPORT_TEXT = 'Certo, vamos criar uma pauta nova com o seu relato.';
export const NO_SIMILAR_TEXT = `Não encontrei pauta aberta parecida com o seu relato. Quer criar uma pauta nova com ele?\n${YES_NO_TEXT}`;
export const NOTHING_CREATED_TEXT = 'Tudo bem, não criei nada.';
export const REPORT_LOST_TEXT =
  'Não consegui recuperar o seu relato. Escolha 1 no menu para relatar de novo.';

/** Linha que leva à pauta nova. */
export const OTHER_ROW_ID = 'outro';
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

/** "É outro problema" / "sim": pauta nova, levando o relato e o bloco; a lista já não serve. */
async function paraPautaNova(ctx: StepContext): Promise<StepResult> {
  const resultado = await entrarNaPautaNova(ctx, [NEW_FROM_REPORT_TEXT]);
  return { ...resultado, data: { ...resultado.data, parecidas: undefined } };
}

export const reportPickSimilar: StepHandler = (ctx) => {
  const { state, input } = ctx;
  const parecidas = dadosDoRelato(state.data).parecidas ?? [];
  const texto = normalize(input.text);

  if (parecidas.length === 0) {
    if (YES.has(texto) || input.text.trim() === OTHER_ROW_ID) return paraPautaNova(ctx);
    if (NO.has(texto)) return { next: 'MENU', data: LIMPAR, replies: [NOTHING_CREATED_TEXT] };
    return { next: 'REPORT_PICK_SIMILAR', replies: [YES_NO_TEXT] };
  }

  if (input.text.trim() === OTHER_ROW_ID || OTHER.has(texto)) return paraPautaNova(ctx);

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
