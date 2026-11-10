/**
 * História 2.4 · Verificação pelo e-mail institucional (RF-B04, RF-B05, RN01).
 *
 *   "3 Verificar e-mail" ──┐
 *   2.6 sem verificação ───┴─▶ VERIFY_ASK_EMAIL ──e-mail da UFAL──▶ VERIFY_ASK_CODE ──▶ VERIFY_ASK_COURSE
 *                                   │  ▲
 *                                   └──┘ sem e-mail, formato errado ou fora da UFAL: pergunta de novo
 *
 * SCRUM-134: o passo do e-mail. Só aceita `@ufal.br` e `@*.ufal.br` (regra no domínio,
 * `emailInstitucional`). O e-mail fica cifrado nos dados da conversa (`emailCifrado`), como o
 * relato da 2.5, e nunca volta nas respostas: elas vão para a fila de saída e para o log.
 * O envio do código, o e-mail já usado (RN01) e o curso são das próximas subtasks da 2.4.
 */
import { emailInstitucional, type ResultadoEmail } from '@lumens/dominio';
import type { StepHandler } from './handlers';

export const EMAIL_QUESTION_TEXT =
  'Qual o seu e-mail institucional da UFAL? Ex.: nome@ufal.br ou nome@ic.ufal.br.';
export const EMAIL_MISSING_TEXT =
  'Não encontrei um e-mail na sua mensagem. Mande só o endereço, ex.: nome@ufal.br.';
export const EMAIL_MANY_TEXT = 'Mande um e-mail só, o da UFAL.';
export const EMAIL_FORMAT_TEXT =
  'Esse endereço não parece um e-mail válido. Confira e mande de novo, ex.: nome@ufal.br.';
export const EMAIL_NOT_UFAL_TEXT =
  'Só aceito e-mail da UFAL: o endereço precisa terminar em @ufal.br ou num domínio da UFAL, como @ic.ufal.br. É assim que sabemos que você é estudante.';
export const EMAIL_ACCEPTED_TEXT = 'E-mail da UFAL recebido ✅';
// TODO(2.4): trocar pelo envio do código de 6 dígitos (próxima subtask).
export const CODE_PENDING_TEXT = '[VERIFY_ASK_CODE — envio do código em construção, história 2.4]';

const RECUSA: Record<Exclude<ResultadoEmail, { valido: true }>['motivo'], string> = {
  sem_email: EMAIL_MISSING_TEXT,
  varios_emails: EMAIL_MANY_TEXT,
  formato: EMAIL_FORMAT_TEXT,
  fora_da_ufal: EMAIL_NOT_UFAL_TEXT,
};

export const verifyAskEmail: StepHandler = ({ input, segredo }) => {
  const resultado = emailInstitucional(input.text);
  if (!resultado.valido) return { next: 'VERIFY_ASK_EMAIL', replies: [RECUSA[resultado.motivo]] };
  return {
    next: 'VERIFY_ASK_CODE',
    data: { emailCifrado: segredo.cifrar(resultado.email) },
    replies: [EMAIL_ACCEPTED_TEXT, CODE_PENDING_TEXT],
  };
};
