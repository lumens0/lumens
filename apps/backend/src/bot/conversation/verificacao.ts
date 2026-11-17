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
 *
 * SCRUM-137 (RN01): com o código certo, liga o telefone ao e-mail no cadastro do estudante
 * (`vincularEmail`). E-mail de outro telefone: explica e pede outro e-mail. O aviso só vem depois
 * do código certo de propósito: avisado antes, qualquer um digitaria o e-mail de um colega para
 * saber se ele usa o Lumens. Assim, só quem abre a caixa daquele e-mail descobre.
 *
 * SCRUM-138: pergunta o curso numa mensagem de lista (só cursos de `CURSOS`: o curso de quem cuida
 * da pauta aparece no site), marca o estudante como verificado e retoma o pedido pendente: a pauta
 * nova (2.6) continua no título, com o relato da 2.5 se houver. Quem já é verificado e escolhe
 * "3" no menu não refaz a verificação.
 */
import { CURSOS, type Db } from '@lumens/db';
import {
  CODIGO_EXPIRA_MS,
  DIGITOS_DO_CODIGO,
  MAX_TENTATIVAS,
  apagarCodigo,
  concluirVerificacao,
  conferirCodigo,
  emailInstitucional,
  esperaParaReenviar,
  gerarCodigo,
  guardarCodigo,
  vincularEmail,
  type ResultadoEmail,
} from '@lumens/dominio';
import { z } from 'zod';
// SCRUM-298: limites acumulados de 24 h.
import {
  bloqueioDaVerificacao,
  registrarNaVerificacao,
  type BloqueioDaVerificacao,
} from '@lumens/dominio';
import type { ServicoDeEmail } from '../../email/codigo';
import { estudanteVerificado } from './estudante';
import type { Segredo, StepContext, StepHandler, StepResult } from './handlers';
import { entrarNoApoio } from './apoio';
import { cuidarDaPauta } from './co-owner';
import { entrarNaPautaNova } from './nova-pauta';
import { vouAjudar } from './proposta';
import { lista, type MensagemDeLista } from './resposta';
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
export const COURSE_QUESTION_TEXT = 'Por último: qual é o seu curso?';
export const COURSE_NOT_FOUND_TEXT = 'Não achei esse curso. Escolha um na lista.';
export const VERIFIED_TEXT =
  'Pronto, você é estudante verificado ✅ Agora pode criar pautas e apoiar as que já existem. A verificação vale para esta conversa: não precisa fazer de novo.';
export const ALREADY_VERIFIED_TEXT =
  'Você já é estudante verificado ✅ Não precisa verificar de novo.';
export const LINK_LOST_TEXT = `Não achei o seu e-mail confirmado. Vamos refazer essa parte: ${EMAIL_QUESTION_TEXT.charAt(0).toLowerCase()}${EMAIL_QUESTION_TEXT.slice(1)}`;

const CURSO_ROW_PREFIX = 'curso:';
/** Cabem 10 linhas na lista do WhatsApp; com mais cursos, 9 e um aviso para digitar o nome. */
const LINHAS_DE_CURSO = 10;

/**
 * A lista de cursos. Com mais de 10, mostra 9 e pede para digitar o nome dos outros. Recebe a
 * lista para o caso de mais de 10 poder ser testado: a `CURSOS` de hoje tem 8.
 */
export function listaDeCursos(cursos: readonly string[] = CURSOS): MensagemDeLista {
  const cabem = cursos.length <= LINHAS_DE_CURSO ? cursos : cursos.slice(0, LINHAS_DE_CURSO - 1);
  const corpo =
    cabem.length < cursos.length
      ? `${COURSE_QUESTION_TEXT} Se o seu não está na lista, escreva o nome dele.`
      : COURSE_QUESTION_TEXT;
  return lista({
    corpo,
    botao: 'Escolher curso',
    linhas: cabem.map((curso) => ({ id: `${CURSO_ROW_PREFIX}${curso}`, titulo: curso })),
  });
}

/** O curso escolhido: a linha da lista ou o nome digitado (sem diferença de acento e maiúscula). */
export function cursoEscolhido(resposta: string): string | undefined {
  const bruta = resposta.trim();
  if (bruta.startsWith(CURSO_ROW_PREFIX)) {
    const curso = bruta.slice(CURSO_ROW_PREFIX.length);
    return CURSOS.find((c) => c === curso);
  }
  const texto = normalize(bruta);
  return CURSOS.find((c) => normalize(c) === texto);
}
export const CODE_EXPIRED_TEXT = `Esse código venceu: ele vale ${String(CODIGO_EXPIRA_MS / 60_000)} minutos. ${RESEND_HINT_TEXT}`;
export const NO_ATTEMPTS_TEXT = `Você errou o código ${String(MAX_TENTATIVAS)} vezes, então ele não vale mais. ${RESEND_HINT_TEXT}`;
export const NO_CODE_TEXT = `Não tenho um código ativo para você. ${RESEND_HINT_TEXT}`;
export const CODE_RESENT_TEXT = `Enviei um código novo para o seu e-mail da UFAL. Só vale o último: ele vale por ${String(CODIGO_EXPIRA_MS / 60_000)} minutos.`;
export const RESEND_FAILED_TEXT =
  'Não consegui enviar o código agora. Tente daqui a pouco: responda *reenviar*.';
export const EMAIL_LOST_TEXT = `Não consegui recuperar o seu e-mail. ${EMAIL_QUESTION_TEXT}`;
export const EMAIL_IN_USE_TEXT = `Esse e-mail da UFAL já está ligado a outra conversa no Lumens. Cada e-mail vale para uma conversa só: é assim que cada estudante apoia uma pauta uma vez. Se a outra conversa era sua, fale com a equipe do Lumens. Para continuar com outro e-mail, ${EMAIL_QUESTION_TEXT.charAt(0).toLowerCase()}${EMAIL_QUESTION_TEXT.slice(1)}`;
export const LINK_UNAVAILABLE_TEXT =
  'Não consegui concluir a verificação agora. Digite o código de novo daqui a pouco.';

export function wrongCodeText(restantes: number): string {
  if (restantes === 0) return NO_ATTEMPTS_TEXT;
  const plural = restantes === 1 ? 'tentativa' : 'tentativas';
  return `Código errado. Você ainda tem ${String(restantes)} ${plural}.`;
}

const horaBR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Maceio',
  hour: '2-digit',
  minute: '2-digit',
});
const diaBR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Maceio',
  day: '2-digit',
  month: '2-digit',
});

/**
 * SCRUM-298: limite acumulado de 24 h. Diz até quando, e não se foi pelo e-mail ou pela conversa,
 * para não ajudar quem testa e-mails de outras pessoas.
 */
export function blockedText(bloqueio: NonNullable<BloqueioDaVerificacao>): string {
  const quando = `${horaBR.format(bloqueio.liberaEm)} de ${diaBR.format(bloqueio.liberaEm)}`;
  return bloqueio.motivo === 'envios'
    ? `Por segurança, já saíram códigos demais para este e-mail ou esta conversa nas últimas 24 horas. Você pode pedir outro a partir das ${quando}.`
    : `Por segurança, a verificação deste e-mail ou desta conversa ficou bloqueada depois de muitos códigos errados. Você pode tentar de novo a partir das ${quando}.`;
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

type Envio = { enviado: true } | { enviado: false; bloqueio?: NonNullable<BloqueioDaVerificacao> };

/**
 * Gera, guarda (só o hash) e envia um código novo. Antes, confere os limites de 24 h (SCRUM-298):
 * bloqueado, nenhum e-mail sai. Guarda antes de enviar: se gravar falhar, nenhum código sai. Se o
 * envio falhar, apaga o código que ninguém recebeu (dá para pedir outro na hora) e não conta o
 * envio no limite. Sem o HMAC, não há como contar o limite do e-mail: não envia.
 */
async function enviarCodigoNovo(
  db: Db,
  phoneHmac: string,
  email: ServicoDeEmail | undefined,
  hmac: ((valor: string) => string) | undefined,
  endereco: string,
): Promise<Envio> {
  if (email === undefined || hmac === undefined) return { enviado: false };
  const chaves = { telefoneHmac: phoneHmac, emailHmac: hmac(endereco) };
  const bloqueio = await bloqueioDaVerificacao(db, chaves);
  if (bloqueio !== undefined) return { enviado: false, bloqueio };

  const codigo = gerarCodigo();
  await guardarCodigo(db, { telefoneHmac: phoneHmac, codigo });
  if (await email.enviarCodigo(endereco, codigo)) {
    await registrarNaVerificacao(db, 'envio', chaves);
    return { enviado: true };
  }
  await apagarCodigo(db, phoneHmac);
  return { enviado: false };
}

const RECUSA: Record<Exclude<ResultadoEmail, { valido: true }>['motivo'], string> = {
  sem_email: EMAIL_MISSING_TEXT,
  varios_emails: EMAIL_MANY_TEXT,
  formato: EMAIL_FORMAT_TEXT,
  fora_da_ufal: EMAIL_NOT_UFAL_TEXT,
};

export const verifyAskEmail: StepHandler = async ({
  input,
  segredo,
  db,
  phoneHmac,
  email,
  hmac,
}) => {
  const resultado = emailInstitucional(input.text);
  if (!resultado.valido) return { next: 'VERIFY_ASK_EMAIL', replies: [RECUSA[resultado.motivo]] };

  // Voltar e mandar o e-mail de novo também é pedir outro código: vale o mesmo intervalo.
  const espera = await esperaParaReenviar(db, { telefoneHmac: phoneHmac });
  if (espera > 0) return { next: 'VERIFY_ASK_EMAIL', replies: [waitText(espera)] };

  const envio = await enviarCodigoNovo(db, phoneHmac, email, hmac, resultado.email);
  if (!envio.enviado) {
    const resposta =
      envio.bloqueio === undefined ? CODE_NOT_SENT_TEXT : blockedText(envio.bloqueio);
    return { next: 'VERIFY_ASK_EMAIL', replies: [resposta] };
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
  hmac,
  segredo,
  data,
}: {
  db: Db;
  phoneHmac: string;
  email: ServicoDeEmail | undefined;
  hmac: ((valor: string) => string) | undefined;
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
  const envio = await enviarCodigoNovo(db, phoneHmac, email, hmac, endereco);
  if (envio.enviado) return { next: 'VERIFY_ASK_CODE', replies: [CODE_RESENT_TEXT] };
  const resposta = envio.bloqueio === undefined ? RESEND_FAILED_TEXT : blockedText(envio.bloqueio);
  return { next: 'VERIFY_ASK_CODE', replies: [resposta] };
}

export const verifyAskCode: StepHandler = async ({
  state,
  input,
  db,
  phoneHmac,
  phoneCifrado,
  hmac,
  segredo,
  email,
}) => {
  if (RESEND.has(normalize(input.text))) {
    return reenviar({ db, phoneHmac, email, hmac, segredo, data: state.data });
  }

  // "123 456" e "123-456" também valem: o WhatsApp às vezes separa os dígitos ao copiar.
  const digitos = input.text.replace(/[\s.-]/g, '');
  if (!/^\d+$/.test(digitos)) return { next: 'VERIFY_ASK_CODE', replies: [CODE_HELP_TEXT] };
  // Tamanho errado não gasta tentativa: é engano de digitação, não palpite.
  if (digitos.length !== DIGITOS_DO_CODIGO) {
    return { next: 'VERIFY_ASK_CODE', replies: [CODE_LENGTH_TEXT] };
  }

  // Tudo o que o vínculo precisa é conferido antes do código: código certo é gasto na hora.
  const endereco = emailDaConversa(segredo, state.data);
  if (endereco === undefined) {
    return {
      next: 'VERIFY_ASK_EMAIL',
      data: { emailCifrado: undefined },
      replies: [EMAIL_LOST_TEXT],
    };
  }
  if (phoneCifrado === undefined || hmac === undefined) {
    return { next: 'VERIFY_ASK_CODE', replies: [LINK_UNAVAILABLE_TEXT] };
  }

  const emailHmac = hmac(endereco);
  const resultado = await conferirCodigo(db, {
    telefoneHmac: phoneHmac,
    emailHmac,
    codigo: digitos,
  });
  if (resultado.certo) {
    // Mesma transação da mensagem: se o vínculo falhar, o código volta a valer.
    const vinculo = await vincularEmail(db, {
      telefoneHmac: phoneHmac,
      telefoneCifrado: phoneCifrado,
      emailHmac,
      emailCifrado: segredo.cifrar(endereco),
    });
    if (!vinculo.vinculado) {
      return {
        next: 'VERIFY_ASK_EMAIL',
        data: { emailCifrado: undefined },
        replies: [EMAIL_IN_USE_TEXT],
      };
    }
    // SCRUM-298: o cadastro veio de outra identidade. Avisa o dono no e-mail: se não foi ele,
    // alguém acertou o código e tomou o cadastro. Falha no envio não desfaz a verificação.
    if (vinculo.transferido === true) await email?.avisarTransferencia?.(endereco, new Date());
    // O e-mail já está no cadastro: a conversa não precisa mais dele.
    return {
      next: 'VERIFY_ASK_COURSE',
      data: { emailCifrado: undefined },
      replies: [CODE_OK_TEXT, listaDeCursos()],
    };
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
    case 'bloqueado':
      return {
        next: 'VERIFY_ASK_CODE',
        replies: [blockedText({ motivo: 'erros', liberaEm: resultado.liberaEm })],
      };
  }
};

/** "3 Verificar e-mail" no menu. Quem já é verificado não refaz a verificação. */
export async function entrarNaVerificacao({
  db,
  phoneHmac,
}: Pick<StepContext, 'db' | 'phoneHmac'>): Promise<StepResult> {
  if ((await estudanteVerificado(db, phoneHmac)) !== undefined) {
    return { next: 'MENU', replies: [ALREADY_VERIFIED_TEXT] };
  }
  return { next: 'VERIFY_ASK_EMAIL', replies: [EMAIL_QUESTION_TEXT] };
}

const pendenteSchema = z.object({
  pendingCommand: z.object({ kind: z.string(), id: z.string().optional() }).optional(),
});

export const verifyAskCourse: StepHandler = async (ctx) => {
  const { input, db, phoneHmac, state } = ctx;
  const curso = cursoEscolhido(input.text);
  if (curso === undefined) {
    return { next: 'VERIFY_ASK_COURSE', replies: [COURSE_NOT_FOUND_TEXT, listaDeCursos()] };
  }

  const resultado = await concluirVerificacao(db, { telefoneHmac: phoneHmac, curso });
  if (!resultado.verificado) {
    // `curso_invalido` não acontece: o curso veio da lista. Sem vínculo, o e-mail se perdeu.
    return { next: 'VERIFY_ASK_EMAIL', replies: [LINK_LOST_TEXT] };
  }

  // Retoma o que a pessoa pediu antes de ser mandada para a verificação.
  const lidos = pendenteSchema.safeParse(state.data);
  const pendente = lidos.success ? lidos.data.pendingCommand : undefined;
  if (pendente?.kind === 'ajudar' && pendente.id !== undefined) {
    const ajuda = await vouAjudar(ctx, pendente.id, [VERIFIED_TEXT]);
    return { ...ajuda, data: { ...ajuda.data, pendingCommand: undefined } };
  }
  if (pendente?.kind === 'nova-pauta') {
    const pauta = await entrarNaPautaNova(ctx, [VERIFIED_TEXT]);
    return { ...pauta, data: { ...pauta.data, pendingCommand: undefined } };
  }
  if (pendente?.kind === 'apoiar' && pendente.id !== undefined) {
    // 2.7: retoma o apoio pedido antes da verificação (pela 2.5 ou pelo site, na 2.8).
    return entrarNoApoio(ctx, pendente.id, [VERIFIED_TEXT]);
  }
  if (pendente?.kind === 'cuidar' && pendente.id !== undefined) {
    // 2.8: retoma o pedido de virar co-owner.
    const cuidar = await cuidarDaPauta(ctx, pendente.id, [VERIFIED_TEXT]);
    return { ...cuidar, data: { ...cuidar.data, pendingCommand: undefined } };
  }
  return { next: 'MENU', replies: [VERIFIED_TEXT] };
};
