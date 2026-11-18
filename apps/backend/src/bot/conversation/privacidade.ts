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
import { apagarCodigo, sairDoLumens } from '@lumens/dominio';
import type { StepContext, StepHandler, StepResult } from './handlers';
import { normalize } from './texto';

// SCRUM-174: texto e base legal em docs/decisoes/SCRUM-174-aviso-de-privacidade.md. Ele descreve
// só o que o sistema faz hoje, igual à página /privacidade: mudou o comportamento, mude os dois.
export const PRIVACY_NOTICE_TEXT = [
  '🔒 *Sua privacidade no Lumens*',
  'Guardamos, cifrado, o identificador desta conversa (no WhatsApp, o número; no Telegram, o id do chat) para continuar esta conversa. Se você se verificar, guardamos também seu e-mail @ufal.br (cifrado) e seu curso. Se você sair, do e-mail fica só uma marca que não permite recuperá-lo, para seus apoios não contarem duas vezes se você voltar.',
  'No site aparecem as pautas, os relatos aprovados e o curso de quem participa — nunca nome, telefone ou e-mail. Quem apoia não aparece: só o total.',
  'Ao se verificar, você concorda com esse uso (LGPD, art. 7º, I). Para sair, envie *sair* a qualquer momento.',
  `Política completa: ${ORIGEM_SITE_PRODUCAO}/privacidade`,
].join('\n');

// SCRUM-314: o que sai e o que fica, como o `sairDoLumens` faz (docs/decisoes/SCRUM-314-...).
export const LEAVE_CONFIRM_TEXT = [
  'Quer mesmo sair do Lumens?',
  'O seu identificador e o seu e-mail serão apagados, e você deixa de ser responsável pelas pautas que cuidava. Os relatos que ainda não foram publicados também são apagados, com as fotos.',
  `Continuam, sem ligação com você: os apoios que você já deu, os relatos já publicados no site e os PDFs de resposta que você enviou. Para pedir a remoção de algum deles, veja como em ${ORIGEM_SITE_PRODUCAO}/privacidade.`,
  'Responda *sim* para sair ou qualquer outra coisa para continuar.',
].join('\n\n');

export const LEFT_TEXT =
  'Pronto, você saiu do Lumens. Apagamos o seu identificador, o seu e-mail, esta conversa e os relatos que ainda não estavam publicados. Se quiser voltar, é só mandar uma mensagem e se verificar de novo.';

export const NOTHING_TO_DELETE_TEXT =
  'Você não tem cadastro no Lumens, então não há vínculo para apagar. Apaguei esta conversa e o código de verificação, se havia um.';

export const STAYED_TEXT = 'Ok, você continua no Lumens.';

// SCRUM-334: sair apaga o vínculo e não tem volta, então um "s" solto (tecla escapada) não confirma.
// O "sair" de novo também confirma: o router o entrega a este passo em vez de pedir a saída outra vez.
const CONFIRMA = new Set(['sim', 'sair', 'sim, sair', 'quero sair', 'confirmar']);

/**
 * Estudante ligado a este telefone. Quem já saiu não aparece: o telefone dele virou lápide e não
 * coincide com o HMAC. Quem voltou e ainda não escolheu o curso tem o telefone restaurado com
 * `saiu_em` preenchido (SCRUM-331); conta, porque os dados pessoais voltaram e o `sair` precisa
 * apagá-los.
 */
async function estudanteDoTelefone(ctx: StepContext): Promise<string | undefined> {
  const [estudante] = await ctx.db
    .select({ id: estudantes.id })
    .from(estudantes)
    .where(eq(estudantes.telefoneHmac, ctx.phoneHmac));
  return estudante?.id;
}

/**
 * "sair" de qualquer passo. Sem cadastro, apaga a conversa e o código de verificação; com cadastro,
 * pede confirmação. O código existe sem cadastro: o `verifyAskEmail` o grava antes de o
 * `verifyAskCode` criar o estudante, e ele guarda o HMAC do telefone.
 */
export async function pedirSaida(ctx: StepContext): Promise<StepResult> {
  if ((await estudanteDoTelefone(ctx)) === undefined) {
    await apagarCodigo(ctx.db, ctx.phoneHmac);
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
    const saida = await ctx.db.transaction((tx) => sairDoLumens(tx, { estudanteId }));
    // SCRUM-314: as fotos dos relatos apagados estão no storage, fora do banco. Melhor esforço: se a
    // transação desfizer depois, o retry roda o `sair` de novo e o relato sai de vez.
    if (saida.saiu && saida.fotosParaApagar.length > 0) {
      await ctx.fotos?.removerFotos?.(saida.fotosParaApagar);
    }
  } else {
    // O cadastro sumiu no meio: o `sairDoLumens` não roda, então o código sai aqui.
    await apagarCodigo(ctx.db, ctx.phoneHmac);
  }
  return { next: 'MENU', replies: [LEFT_TEXT], apagarConversa: true };
};
