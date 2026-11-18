/**
 * História 2.5 · Relatar e ver se já existe pauta parecida (RF-B01, RF-B02).
 *
 *   REPORT_ASK_TEXT ──(bloco citado no relato)──────────────┐
 *        │                                                  ▼
 *        └──(não citou)──▶ REPORT_ASK_BLOCK ──▶ REPORT_PICK_SIMILAR ──▶ "É essa"  → apoio (2.7, `apoio.ts`)
 *                          lista de blocos       lista: até 3 pautas  └▶ "É outro" → pauta nova (2.6)
 *
 * O relato fica cifrado nos dados da conversa (`relatoCifrado`), nunca em claro: a tabela
 * `conversa` guarda o passo de cada telefone por 24h, e o relato é texto livre, que pode ter nome,
 * e-mail ou telefone. Quando a pessoa escolhe "É outro problema", `relatoCifrado` e `blocoId`
 * continuam nos dados, e a pauta nova (2.6, `nova-pauta.ts`) usa os dois como descrição e lugar.
 * Quando escolhe "É essa", o `relatoCifrado` segue para o apoio, que oferece juntá-lo à pauta.
 */
import { SEM_APOIO, buscarPautasParecidas, listarBlocos, termosDaBusca } from '@lumens/dominio';
import { eq, pautas, type Db } from '@lumens/db';
import { z } from 'zod';
import { entrarNoApoio } from './apoio';
import { BLOCK_NOT_FOUND_TEXT, blocoCitado, blocoEscolhido, listaDeBlocos } from './blocos';
import { listaDeCategorias } from './categorias';
import type { DataPatch, Segredo, StepContext, StepHandler, StepResult } from './handlers';
import { NEW_SIMILAR_LIST_TEXT, entrarNaPautaNova } from './nova-pauta';
import {
  escolheuOutro,
  listaDeParecidas,
  OTHER_ROW_ID,
  parecidaSchema,
  pautaEscolhida,
  type Parecida,
} from './parecidas';
import { normalize } from './texto';

// Os testes do relato e quem já importava daqui continuam achando as funções de blocos e da lista.
export {
  BLOCK_NOT_FOUND_TEXT,
  BLOCK_QUESTION_TEXT,
  CAMPUS_ROW_ID,
  blocoCitado,
  blocoEscolhido,
  listaDeBlocos,
} from './blocos';
export { listaDeParecidas, OTHER_ROW_ID, SIMILAR_LIST_TEXT } from './parecidas';

export const REPORT_PROMPT_TEXT =
  'Descreva o problema que você encontrou. Se alguém já te mandou o relato, pode encaminhar a mensagem aqui.';
export const REPORT_TOO_SHORT_TEXT =
  'Conte um pouco mais: o que aconteceu e onde? Ex.: "o bebedouro do bloco 18 está quebrado".';
export const PICK_AGAIN_TEXT = 'Não entendi. Escolha uma pauta da lista ou "É outro problema".';
export const YES_NO_TEXT = 'Responda *sim* para criar uma pauta nova ou *não* para voltar ao menu.';
export const NEW_FROM_REPORT_TEXT = 'Certo, vamos criar uma pauta nova com o seu relato.';
export const NO_SIMILAR_TEXT = `Não encontrei pauta aberta parecida com o seu relato. Quer criar uma pauta nova com ele?\n${YES_NO_TEXT}`;
export const NOTHING_CREATED_TEXT = 'Tudo bem, não criei nada.';
export const NEW_SUPPORT_FAILED_TEXT =
  'Essa pauta não está recebendo apoios agora. Vamos seguir com a sua pauta nova.';
export const REPORT_LOST_TEXT =
  'Não consegui recuperar o seu relato. Mande *menu* e escolha *Relatar problema* para relatar de novo.';

const YES = new Set(['sim', 's', 'quero', 'criar', 'pode']);
const NO = new Set(['nao', 'n', 'nao quero']);

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

  if (escolheuOutro(input.text)) return paraPautaNova(ctx);

  const escolhida = pautaEscolhida(input.text, parecidas);
  if (escolhida === undefined) {
    return { next: 'REPORT_PICK_SIMILAR', replies: [PICK_AGAIN_TEXT, listaDeParecidas(parecidas)] };
  }
  // "É essa": o apoio vai na mesma transação da conversa e leva o relato para ser oferecido.
  return entrarNoApoio(ctx, escolhida.id);
};

/**
 * A mesma escolha, vinda da pauta nova pelo menu (SCRUM-346, `newAskPlace`). Fica aqui, e não em
 * `nova-pauta.ts`, porque o apoio já importa `nova-pauta.ts`. "É outro" volta à pauta nova, que
 * segue para a descrição com o título e o bloco guardados; "É essa" vai ao apoio, sem o título.
 */
export const newPickSimilar: StepHandler = async (ctx) => {
  const { state, input } = ctx;
  const parecidas = dadosDoRelato(state.data).parecidas ?? [];

  if (parecidas.length === 0 || escolheuOutro(input.text)) {
    return {
      next: 'NEW_ASK_CATEGORY',
      data: { parecidas: undefined },
      replies: [listaDeCategorias()],
    };
  }

  const escolhida = pautaEscolhida(input.text, parecidas);
  if (escolhida === undefined) {
    return {
      next: 'NEW_PICK_SIMILAR',
      replies: [PICK_AGAIN_TEXT, listaDeParecidas(parecidas, NEW_SIMILAR_LIST_TEXT)],
    };
  }
  // A pauta pode ter fechado entre a lista e a escolha (curadoria recusou, meta conquistada):
  // aí segue a pauta nova, que era o que a pessoa veio fazer, sem perder o título e o bloco.
  // Decide pela pauta, não pelo passo que o apoio devolve: outras recusas (cadastro que perdeu a
  // verificação) também voltam ao menu e não devem virar pauta nova recusada no fim.
  const [pauta] = await ctx.db
    .select({ status: pautas.status })
    .from(pautas)
    .where(eq(pautas.id, escolhida.id));
  if (pauta === undefined || SEM_APOIO.has(pauta.status)) {
    return {
      next: 'NEW_ASK_CATEGORY',
      data: { parecidas: undefined },
      replies: [NEW_SUPPORT_FAILED_TEXT, listaDeCategorias()],
    };
  }

  const resultado = await entrarNoApoio(ctx, escolhida.id);
  // A pauta nova não vai ser criada: o título e o bloco saem da conversa junto com a lista.
  return {
    ...resultado,
    data: {
      tituloCifrado: undefined,
      blocoId: undefined,
      parecidas: undefined,
      ...resultado.data,
    },
  };
};
