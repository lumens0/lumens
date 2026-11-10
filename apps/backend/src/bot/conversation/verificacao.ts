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
 *
 * SCRUM-135: aceito o e-mail, gera o código de 6 dígitos, guarda só o hash (10 minutos) e envia
 * por e-mail. Se o envio falhar, a pessoa manda o e-mail de novo. Conferir o código, as
 * tentativas e o reenvio, o e-mail já usado (RN01) e o curso são das próximas subtasks da 2.4.
 */
import {
  CODIGO_EXPIRA_MS,
  DIGITOS_DO_CODIGO,
  emailInstitucional,
  gerarCodigo,
  guardarCodigo,
  type ResultadoEmail,
} from '@lumens/dominio';
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
export const CODE_SENT_TEXT = `Enviei um código de ${String(DIGITOS_DO_CODIGO)} dígitos para o seu e-mail da UFAL. Ele vale por ${String(CODIGO_EXPIRA_MS / 60_000)} minutos: digite o código aqui. Não chegou? Confira a caixa de spam.`;
export const CODE_NOT_SENT_TEXT =
  'Não consegui enviar o código para o seu e-mail agora. Tente de novo daqui a pouco: mande o seu e-mail da UFAL outra vez.';

const RECUSA: Record<Exclude<ResultadoEmail, { valido: true }>['motivo'], string> = {
  sem_email: EMAIL_MISSING_TEXT,
  varios_emails: EMAIL_MANY_TEXT,
  formato: EMAIL_FORMAT_TEXT,
  fora_da_ufal: EMAIL_NOT_UFAL_TEXT,
};

export const verifyAskEmail: StepHandler = async ({ input, segredo, db, phoneHmac, email }) => {
  const resultado = emailInstitucional(input.text);
  if (!resultado.valido) return { next: 'VERIFY_ASK_EMAIL', replies: [RECUSA[resultado.motivo]] };
  if (email === undefined) return { next: 'VERIFY_ASK_EMAIL', replies: [CODE_NOT_SENT_TEXT] };

  // Guarda antes de enviar: se gravar falhar, nenhum código sai. Se o envio falhar, o hash fica
  // no banco sem ninguém ter recebido o código, e o próximo pedido o substitui.
  const codigo = gerarCodigo();
  await guardarCodigo(db, { telefoneHmac: phoneHmac, codigo });
  if (!(await email.enviarCodigo(resultado.email, codigo))) {
    return { next: 'VERIFY_ASK_EMAIL', replies: [CODE_NOT_SENT_TEXT] };
  }
  return {
    next: 'VERIFY_ASK_CODE',
    data: { emailCifrado: segredo.cifrar(resultado.email) },
    replies: [CODE_SENT_TEXT],
  };
};
