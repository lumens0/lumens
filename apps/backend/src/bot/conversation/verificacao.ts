/**
 * História 2.4 · Verificação pelo e-mail institucional (RF-B04, RF-B05, RN01).
 *
 *   "3 Verificar e-mail" ──┐
 *   2.6 sem verificação ───┴─▶ VERIFY_ASK_EMAIL ──e-mail da UFAL──▶ VERIFY_ASK_CODE ──certo──▶ VERIFY_ASK_COURSE
 *                                   │  ▲                                  │  ▲
 *                                   └──┘ recusado ou envio falhou         └──┘ errado, vencido, "reenviar"
 *
 * SCRUM-134: o passo do e-mail. Só aceita `@ufal.br` e `@*.ufal.br` (regra no domínio,
 * `emailInstitucional`). O e-mail fica cifrado nos dados da conversa (`emailCifrado`), como o
 * relato da 2.5, e nunca volta nas respostas: elas vão para a fila de saída e para o log.
 *
 * SCRUM-135: aceito o e-mail, gera o código de 6 dígitos, guarda só o hash (10 minutos) e envia
 * por e-mail. Se o envio falhar, a pessoa manda o e-mail de novo. Conferir o código, as
 * tentativas e o reenvio, o e-mail já usado (RN01) e o curso são das próximas subtasks da 2.4.
 *
 * SCRUM-136: o passo do código. Confere o código (certo: segue para o curso), conta as tentativas
 * (no máximo 5 por código) e aceita "reenviar", liberado 60 s depois do último envio. O mesmo
 * intervalo vale para quem volta e manda o e-mail de novo: o bot não vira um disparador de e-mails
 * para caixas de outras pessoas.
 */
import type { Db } from '@lumens/db';
import {
  CODIGO_EXPIRA_MS,
  DIGITOS_DO_CODIGO,
  MAX_TENTATIVAS,
  apagarCodigo,
  conferirCodigo,
  emailInstitucional,
  esperaParaReenviar,
  gerarCodigo,
  guardarCodigo,
  type ResultadoEmail,
} from '@lumens/dominio';
import { z } from 'zod';
import type { ServicoDeEmail } from '../../email/codigo';
import type { Segredo, StepHandler, StepResult } from './handlers';
import { normalize } from './texto';

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

export const RESEND_HINT_TEXT = 'Para receber outro código, responda *reenviar*.';
export const CODE_HELP_TEXT = `Digite o código de ${String(DIGITOS_DO_CODIGO)} dígitos que chegou no seu e-mail. ${RESEND_HINT_TEXT}`;
export const CODE_LENGTH_TEXT = `O código tem ${String(DIGITOS_DO_CODIGO)} dígitos. Confira no e-mail e digite de novo.`;
export const CODE_OK_TEXT = 'Código certo ✅';
// TODO(2.4): trocar pela pergunta do curso (próxima subtask).
export const COURSE_PENDING_TEXT = '[VERIFY_ASK_COURSE — curso em construção, história 2.4]';
export const CODE_EXPIRED_TEXT = `Esse código venceu: ele vale ${String(CODIGO_EXPIRA_MS / 60_000)} minutos. ${RESEND_HINT_TEXT}`;
export const NO_ATTEMPTS_TEXT = `Você errou o código ${String(MAX_TENTATIVAS)} vezes, então ele não vale mais. ${RESEND_HINT_TEXT}`;
export const NO_CODE_TEXT = `Não tenho um código ativo para você. ${RESEND_HINT_TEXT}`;
export const CODE_RESENT_TEXT = `Enviei um código novo para o seu e-mail da UFAL. Só vale o último: ele vale por ${String(CODIGO_EXPIRA_MS / 60_000)} minutos.`;
export const RESEND_FAILED_TEXT =
  'Não consegui enviar o código agora. Tente daqui a pouco: responda *reenviar*.';
export const EMAIL_LOST_TEXT = `Não consegui recuperar o seu e-mail. ${EMAIL_QUESTION_TEXT}`;

export function wrongCodeText(restantes: number): string {
  if (restantes === 0) return NO_ATTEMPTS_TEXT;
  const plural = restantes === 1 ? 'tentativa' : 'tentativas';
  return `Código errado. Você ainda tem ${String(restantes)} ${plural}.`;
}

export function waitText(espera: number): string {
  const segundos = Math.max(1, Math.ceil(espera / 1000));
  return `Acabei de enviar um código. Espere ${String(segundos)} s para pedir outro.`;
}

/** Palavras que pedem um código novo. Depois do `normalize`: sem acento, minúsculas. */
const RESEND = new Set([
  'reenviar',
  'reenvia',
  'reenvie',
  'reenviar codigo',
  'enviar de novo',
  'manda de novo',
  'outro codigo',
  'novo codigo',
  'nao chegou',
  'nao recebi',
]);

const dadosSchema = z.object({ emailCifrado: z.string().optional() });

function emailDaConversa(segredo: Segredo, data: unknown): string | undefined {
  const lidos = dadosSchema.safeParse(data);
  const cifrado = lidos.success ? lidos.data.emailCifrado : undefined;
  if (cifrado === undefined) return undefined;
  try {
    return segredo.decifrar(cifrado);
  } catch {
    return undefined;
  }
}

/**
 * Gera, guarda (só o hash) e envia um código novo. Guarda antes de enviar: se gravar falhar,
 * nenhum código sai. Se o envio falhar, apaga o código que ninguém recebeu, para a pessoa poder
 * pedir outro na hora, sem esperar os 60 s.
 */
async function enviarCodigoNovo(
  db: Db,
  phoneHmac: string,
  email: ServicoDeEmail | undefined,
  endereco: string,
): Promise<boolean> {
  if (email === undefined) return false;
  const codigo = gerarCodigo();
  await guardarCodigo(db, { telefoneHmac: phoneHmac, codigo });
  if (await email.enviarCodigo(endereco, codigo)) return true;
  await apagarCodigo(db, phoneHmac);
  return false;
}

const RECUSA: Record<Exclude<ResultadoEmail, { valido: true }>['motivo'], string> = {
  sem_email: EMAIL_MISSING_TEXT,
  varios_emails: EMAIL_MANY_TEXT,
  formato: EMAIL_FORMAT_TEXT,
  fora_da_ufal: EMAIL_NOT_UFAL_TEXT,
};

export const verifyAskEmail: StepHandler = async ({ input, segredo, db, phoneHmac, email }) => {
  const resultado = emailInstitucional(input.text);
  if (!resultado.valido) return { next: 'VERIFY_ASK_EMAIL', replies: [RECUSA[resultado.motivo]] };

  // Voltar e mandar o e-mail de novo também é pedir outro código: vale o mesmo intervalo.
  const espera = await esperaParaReenviar(db, { telefoneHmac: phoneHmac });
  if (espera > 0) return { next: 'VERIFY_ASK_EMAIL', replies: [waitText(espera)] };

  if (!(await enviarCodigoNovo(db, phoneHmac, email, resultado.email))) {
    return { next: 'VERIFY_ASK_EMAIL', replies: [CODE_NOT_SENT_TEXT] };
  }
  return {
    next: 'VERIFY_ASK_CODE',
    data: { emailCifrado: segredo.cifrar(resultado.email) },
    replies: [CODE_SENT_TEXT],
  };
};

async function reenviar({
  db,
  phoneHmac,
  email,
  segredo,
  data,
}: {
  db: Db;
  phoneHmac: string;
  email: ServicoDeEmail | undefined;
  segredo: Segredo;
  data: unknown;
}): Promise<StepResult> {
  const espera = await esperaParaReenviar(db, { telefoneHmac: phoneHmac });
  if (espera > 0) return { next: 'VERIFY_ASK_CODE', replies: [waitText(espera)] };

  const endereco = emailDaConversa(segredo, data);
  if (endereco === undefined) {
    return {
      next: 'VERIFY_ASK_EMAIL',
      data: { emailCifrado: undefined },
      replies: [EMAIL_LOST_TEXT],
    };
  }
  const enviado = await enviarCodigoNovo(db, phoneHmac, email, endereco);
  return { next: 'VERIFY_ASK_CODE', replies: [enviado ? CODE_RESENT_TEXT : RESEND_FAILED_TEXT] };
}

export const verifyAskCode: StepHandler = async ({
  state,
  input,
  db,
  phoneHmac,
  segredo,
  email,
}) => {
  if (RESEND.has(normalize(input.text))) {
    return reenviar({ db, phoneHmac, email, segredo, data: state.data });
  }

  // "123 456" e "123-456" também valem: o WhatsApp às vezes separa os dígitos ao copiar.
  const digitos = input.text.replace(/[\s.-]/g, '');
  if (!/^\d+$/.test(digitos)) return { next: 'VERIFY_ASK_CODE', replies: [CODE_HELP_TEXT] };
  // Tamanho errado não gasta tentativa: é engano de digitação, não palpite.
  if (digitos.length !== DIGITOS_DO_CODIGO) {
    return { next: 'VERIFY_ASK_CODE', replies: [CODE_LENGTH_TEXT] };
  }

  const resultado = await conferirCodigo(db, { telefoneHmac: phoneHmac, codigo: digitos });
  if (resultado.certo) {
    return { next: 'VERIFY_ASK_COURSE', replies: [CODE_OK_TEXT, COURSE_PENDING_TEXT] };
  }
  switch (resultado.motivo) {
    case 'errado':
      return { next: 'VERIFY_ASK_CODE', replies: [wrongCodeText(resultado.restantes)] };
    case 'sem_tentativas':
      return { next: 'VERIFY_ASK_CODE', replies: [NO_ATTEMPTS_TEXT] };
    case 'expirado':
      return { next: 'VERIFY_ASK_CODE', replies: [CODE_EXPIRED_TEXT] };
    case 'sem_codigo':
      return { next: 'VERIFY_ASK_CODE', replies: [NO_CODE_TEXT] };
  }
};
