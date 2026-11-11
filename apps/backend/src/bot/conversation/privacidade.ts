/**
 * História 5.7 · Aviso de privacidade e comando "sair" (RNF01, RNF03).
 *
 *   qualquer passo ──"sair"──▶ LEAVE_CONFIRM ──"sim"──▶ sairDoLumens + conversa apagada
 *                                          └──outra──▶ MENU
 *
 * O aviso vai no primeiro contato (conversa nova; o router garante isso mesmo quando a primeira
 * mensagem é um comando global). Quem não tem cadastro não tem o que confirmar: a conversa é
 * apagada na hora.
 */
import { ORIGEM_SITE_PRODUCAO } from '@lumens/contratos';
import { eq, estudantes } from '@lumens/db';
import { sairDoLumens } from '@lumens/dominio';
import type { StepContext, StepHandler, StepResult } from './handlers';
import { normalize } from './texto';

// SCRUM-174: rascunho. O texto final (com a base legal) precisa ser fechado com a equipe; o que
// está aqui descreve só o que o sistema faz hoje, igual à página /privacidade.
export const PRIVACY_NOTICE_TEXT = [
  '🔒 Antes de começar: o Lumens guarda seu telefone cifrado e, se você se verificar, seu e-mail @ufal.br cifrado e seu curso.',
  'Seu nome, telefone e e-mail nunca aparecem no site. Quem apoia uma pauta também não aparece: o site mostra só o total.',
  `Política completa: ${ORIGEM_SITE_PRODUCAO}/privacidade`,
  'Para sair e apagar seu vínculo, envie *sair* a qualquer momento.',
].join('\n');

export const LEAVE_CONFIRM_TEXT = [
  'Quer mesmo sair do Lumens?',
  'Seu telefone e seu e-mail serão apagados, e você deixa de ser responsável pelas pautas que cuidava. Os apoios que você já deu continuam contando, sem ligação com você.',
  'Responda *sim* para sair ou qualquer outra coisa para continuar.',
].join('\n\n');

export const LEFT_TEXT =
  'Pronto, você saiu do Lumens. Apagamos seu telefone, seu e-mail e esta conversa. Se quiser voltar, é só mandar uma mensagem e se verificar de novo.';

export const NOTHING_TO_DELETE_TEXT =
  'Você não tem cadastro no Lumens, então não há vínculo para apagar. Apaguei esta conversa.';

export const STAYED_TEXT = 'Ok, você continua no Lumens.';

const CONFIRMA = new Set(['sim', 's', 'sim, sair', 'quero sair', 'confirmar']);

/** Estudante ativo (verificado ou não) ligado a este telefone. Quem já saiu não conta. */
async function estudanteDoTelefone(ctx: StepContext): Promise<string | undefined> {
  const [estudante] = await ctx.db
    .select({ id: estudantes.id, saiuEm: estudantes.saiuEm })
    .from(estudantes)
    .where(eq(estudantes.telefoneHmac, ctx.phoneHmac));
  return estudante !== undefined && estudante.saiuEm === null ? estudante.id : undefined;
}

/** "sair" de qualquer passo. Sem cadastro, só apaga a conversa; com cadastro, pede confirmação. */
export async function pedirSaida(ctx: StepContext): Promise<StepResult> {
  if ((await estudanteDoTelefone(ctx)) === undefined) {
    return { next: 'MENU', replies: [NOTHING_TO_DELETE_TEXT], apagarConversa: true };
  }
  return { next: 'LEAVE_CONFIRM', replies: [LEAVE_CONFIRM_TEXT] };
}

export const leaveConfirm: StepHandler = async (ctx) => {
  if (!CONFIRMA.has(normalize(ctx.input.text))) return { next: 'MENU', replies: [STAYED_TEXT] };

  // Confere de novo: entre o "sair" e o "sim" o cadastro pode ter mudado.
  const estudanteId = await estudanteDoTelefone(ctx);
  if (estudanteId !== undefined) {
    // Savepoint na transação da mensagem, como o `criarPauta` da 2.6.
    await ctx.db.transaction((tx) => sairDoLumens(tx, { estudanteId }));
  }
  return { next: 'MENU', replies: [LEFT_TEXT], apagarConversa: true };
};
