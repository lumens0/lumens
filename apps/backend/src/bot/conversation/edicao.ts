/**
 * Corrigir o título ou a descrição da própria pauta pelo bot (opção 6 do menu).
 *
 *   MENU ──▶ OWNER_EDIT_PICK (só com mais de uma pauta) ──▶ OWNER_EDIT_FIELD ──▶ OWNER_EDIT_TEXT ──▶ MENU
 *
 * Só vale enquanto a pauta espera a curadoria (`pautasEditaveisDoOwner`): o texto novo é o que ela
 * vai avaliar, e o antes e o depois ficam na linha do tempo do painel. Cada passo confere de novo
 * no banco, porque a pauta pode ter sido decidida entre uma mensagem e outra.
 */
import { eq, pautas } from '@lumens/db';
import {
  DESCRICAO_MAXIMA,
  TITULO_MAXIMO,
  editarPautaEmCuradoria,
  pautasEditaveisDoOwner,
  type CampoEditavel,
} from '@lumens/dominio';
import { z } from 'zod';
import { estudanteVerificado } from './estudante';
import type { DataPatch, StepContext, StepHandler, StepResult } from './handlers';
import { botoes, lista } from './resposta';
import { normalize } from './texto';

export const EDIT_NONE_TEXT =
  'Você não tem pauta que ainda possa ser editada. Só dá para corrigir enquanto a curadoria não decidiu. Para criar uma pauta, mande *menu* e escolha *Nova pauta*.';
export const EDIT_PICK_TEXT = 'Qual pauta você quer corrigir?';
export const EDIT_PICK_AGAIN_TEXT = 'Não achei essa pauta. Escolha uma da lista.';
export const EDIT_FIELD_TEXT = 'O que você quer corrigir?';
export const EDIT_FIELD_AGAIN_TEXT = 'Não entendi. Escolha *Título* ou *Descrição*.';
export const EDIT_DONE_TEXT =
  'Pronto, atualizei ✅ A curadoria vai avaliar o texto novo e você recebe a decisão aqui.';
export const EDIT_CLOSED_TEXT =
  'Essa pauta não pode mais ser editada: a curadoria já decidiu. Se algo precisa mudar, escreva para a curadoria.';
export const EDIT_LOST_TEXT = 'Perdi de qual pauta estávamos falando. Mande *6* para recomeçar.';
export const EDIT_EMPTY_TEXT = 'O texto não pode ficar em branco. Mande o texto novo.';

const ROW_PREFIX = 'pauta:';
const CAMPO_ID = { titulo: 'campo:titulo', descricao: 'campo:descricao' } as const;
const NOME_DO_CAMPO: Record<CampoEditavel, string> = { titulo: 'título', descricao: 'descrição' };
const LIMPAR_EDICAO: DataPatch = { pautaId: undefined, campoEditado: undefined };
const dadosSchema = z.object({
  pautaId: z.uuid().optional(),
  campoEditado: z.enum(['titulo', 'descricao']).optional(),
});

export function editTooLongText(campo: CampoEditavel, tamanho: number): string {
  const maximo = campo === 'titulo' ? TITULO_MAXIMO : DESCRICAO_MAXIMA;
  return `O ${NOME_DO_CAMPO[campo]} tem ${String(tamanho)} caracteres e o limite é ${String(maximo)}. Escreva um mais curto.`;
}

function perguntaDoCampo(pauta: { id: string; titulo: string }): StepResult {
  return {
    next: 'OWNER_EDIT_FIELD',
    data: { pautaId: pauta.id, campoEditado: undefined },
    replies: [
      botoes({
        corpo: `*${pauta.titulo}*\n\n${EDIT_FIELD_TEXT}`,
        botoes: [
          { id: CAMPO_ID.titulo, titulo: 'Título' },
          { id: CAMPO_ID.descricao, titulo: 'Descrição' },
          { id: 'menu', titulo: 'Voltar ao menu' },
        ],
      }),
    ],
  };
}

/** "6 Editar pauta" no menu. */
export async function entrarNaEdicao(
  ctx: Pick<StepContext, 'db' | 'phoneHmac'>,
): Promise<StepResult> {
  const estudanteId = await estudanteVerificado(ctx.db, ctx.phoneHmac);
  const editaveis =
    estudanteId === undefined ? [] : await pautasEditaveisDoOwner(ctx.db, estudanteId);
  const [unica] = editaveis;
  if (unica === undefined) return { next: 'MENU', replies: [EDIT_NONE_TEXT] };
  if (editaveis.length === 1) return perguntaDoCampo(unica);
  return {
    next: 'OWNER_EDIT_PICK',
    replies: [
      lista({
        corpo: EDIT_PICK_TEXT,
        botao: 'Ver pautas',
        linhas: editaveis
          .slice(0, 10)
          .map((p) => ({ id: `${ROW_PREFIX}${p.id}`, titulo: p.titulo })),
      }),
    ],
  };
}

export const ownerEditPick: StepHandler = async (ctx) => {
  const estudanteId = await estudanteVerificado(ctx.db, ctx.phoneHmac);
  const editaveis =
    estudanteId === undefined ? [] : await pautasEditaveisDoOwner(ctx.db, estudanteId);
  if (editaveis.length === 0) {
    return { next: 'MENU', data: LIMPAR_EDICAO, replies: [EDIT_NONE_TEXT] };
  }
  const bruta = ctx.input.text.trim();
  const texto = normalize(bruta);
  const numero = /^\d+$/.test(texto) ? Number(texto) : NaN;
  const escolhida = bruta.startsWith(ROW_PREFIX)
    ? editaveis.find((p) => p.id === bruta.slice(ROW_PREFIX.length))
    : numero >= 1 && numero <= Math.min(editaveis.length, 10)
      ? editaveis[numero - 1]
      : editaveis.find((p) => normalize(p.titulo) === texto);
  if (escolhida === undefined) {
    // Refaz a entrada do zero: se, entre a lista e a escolha, sobrou uma pauta só (ou nenhuma), o
    // passo e os dados seguem o resultado novo, e não ficam presos na lista que já não vale.
    const nova = await entrarNaEdicao(ctx);
    return { ...nova, replies: [EDIT_PICK_AGAIN_TEXT, ...nova.replies] };
  }
  return perguntaDoCampo(escolhida);
};

export const ownerEditField: StepHandler = async ({ input, state, db, phoneHmac }) => {
  const lidos = dadosSchema.safeParse(state.data);
  const pautaId = lidos.success ? lidos.data.pautaId : undefined;
  if (pautaId === undefined) {
    return { next: 'MENU', data: LIMPAR_EDICAO, replies: [EDIT_LOST_TEXT] };
  }
  const estudanteId = await estudanteVerificado(db, phoneHmac);
  const editaveis = estudanteId === undefined ? [] : await pautasEditaveisDoOwner(db, estudanteId);
  const pauta = editaveis.find((p) => p.id === pautaId);
  if (pauta === undefined) {
    return { next: 'MENU', data: LIMPAR_EDICAO, replies: [EDIT_CLOSED_TEXT] };
  }
  const bruta = input.text.trim();
  const texto = normalize(bruta);
  const campo: CampoEditavel | undefined =
    bruta === CAMPO_ID.titulo || texto === 'titulo'
      ? 'titulo'
      : bruta === CAMPO_ID.descricao || texto === 'descricao'
        ? 'descricao'
        : undefined;
  if (campo === undefined) {
    const pergunta = perguntaDoCampo(pauta);
    return { ...pergunta, replies: [EDIT_FIELD_AGAIN_TEXT, ...pergunta.replies] };
  }
  const [atual] = await db
    .select({ titulo: pautas.titulo, descricao: pautas.descricao })
    .from(pautas)
    .where(eq(pautas.id, pautaId));
  const textoAtual = campo === 'titulo' ? atual?.titulo : atual?.descricao;
  return {
    next: 'OWNER_EDIT_TEXT',
    data: { pautaId, campoEditado: campo },
    replies: [
      `${campo === 'titulo' ? 'Título' : 'Descrição'} atual:\n${textoAtual ?? ''}`,
      `Mande o ${NOME_DO_CAMPO[campo]} novo (ele substitui o atual). Para desistir, mande *menu*.`,
    ],
  };
};

export const ownerEditText: StepHandler = async ({ input, state, db, phoneHmac }) => {
  const lidos = dadosSchema.safeParse(state.data);
  const pautaId = lidos.success ? lidos.data.pautaId : undefined;
  const campo = lidos.success ? lidos.data.campoEditado : undefined;
  if (pautaId === undefined || campo === undefined) {
    return { next: 'MENU', data: LIMPAR_EDICAO, replies: [EDIT_LOST_TEXT] };
  }
  const estudanteId = await estudanteVerificado(db, phoneHmac);
  if (estudanteId === undefined) {
    return { next: 'MENU', data: LIMPAR_EDICAO, replies: [EDIT_CLOSED_TEXT] };
  }
  const resultado = await db.transaction((tx) =>
    editarPautaEmCuradoria(tx, { pautaId, estudanteId, campo, texto: input.text }),
  );
  if (resultado.editada) return { next: 'MENU', data: LIMPAR_EDICAO, replies: [EDIT_DONE_TEXT] };
  switch (resultado.motivo) {
    case 'texto_vazio':
      return { next: 'OWNER_EDIT_TEXT', replies: [EDIT_EMPTY_TEXT] };
    case 'texto_longo':
      return {
        next: 'OWNER_EDIT_TEXT',
        replies: [editTooLongText(campo, Array.from(input.text.trim()).length)],
      };
    case 'nao_e_owner':
    case 'pauta_fechada':
    case 'ja_tem_apoio':
      return { next: 'MENU', data: LIMPAR_EDICAO, replies: [EDIT_CLOSED_TEXT] };
  }
};
