/**
 * RF-B04 · RN01 · Verificação pelo e-mail institucional (história 2.4).
 *
 * 1. `emailInstitucional` (SCRUM-134): só e-mail da UFAL prova que a pessoa é estudante. O
 *    domínio tem de ser `ufal.br` ou um subdomínio dele (`ic.ufal.br`, `ctec.ufal.br`...).
 * 2. `gerarCodigo` e `guardarCodigo` (SCRUM-135): o código de 6 dígitos que vai por e-mail. O
 *    banco guarda só o hash, que vale 10 minutos; um pedido novo substitui o anterior.
 */
import { createHash, randomInt } from 'node:crypto';
import { codigosVerificacao, type Db } from '@lumens/db';

/** O domínio da UFAL. Subdomínios (`*.ufal.br`) também valem. */
export const DOMINIO_UFAL = 'ufal.br';

/** Tamanho máximo de um endereço de e-mail (RFC 5321). */
export const EMAIL_MAXIMO = 254;

export type ResultadoEmail =
  | { valido: true; email: string }
  | { valido: false; motivo: 'sem_email' | 'varios_emails' | 'formato' | 'fora_da_ufal' };

/** Minúsculas e sem espaços nas pontas: é assim que o e-mail é comparado e guardado. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

const PARTE_LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const ROTULO = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** O domínio é `ufal.br` ou termina em `.ufal.br`, com cada rótulo válido. */
function dominioDaUfal(dominio: string): boolean {
  if (dominio !== DOMINIO_UFAL && !dominio.endsWith(`.${DOMINIO_UFAL}`)) return false;
  return dominio.split('.').every((rotulo) => ROTULO.test(rotulo));
}

/**
 * Acha o e-mail na mensagem e confere se é da UFAL. Aceita a frase inteira ("meu e-mail é
 * joao@ic.ufal.br.") desde que tenha um endereço só; a pontuação em volta não conta.
 */
export function emailInstitucional(mensagem: string): ResultadoEmail {
  const candidatos = mensagem
    .split(/\s+/)
    .filter((palavra) => palavra.includes('@'))
    .map((palavra) => palavra.replace(/^[<("'[]+|[>)"'\].,;:!?]+$/g, ''));
  const [candidato] = candidatos;
  if (candidato === undefined) return { valido: false, motivo: 'sem_email' };
  if (candidatos.length > 1) return { valido: false, motivo: 'varios_emails' };

  const email = normalizarEmail(candidato.replace(/^mailto:/i, ''));
  const partes = email.split('@');
  const [local, dominio] = partes;
  if (
    partes.length !== 2 ||
    local === undefined ||
    dominio === undefined ||
    email.length > EMAIL_MAXIMO ||
    !PARTE_LOCAL.test(local) ||
    !dominio.includes('.')
  ) {
    return { valido: false, motivo: 'formato' };
  }
  if (!dominioDaUfal(dominio)) return { valido: false, motivo: 'fora_da_ufal' };
  return { valido: true, email };
}

/** Quantos dígitos tem o código enviado por e-mail. */
export const DIGITOS_DO_CODIGO = 6;

/** Quanto tempo o código vale depois de enviado. */
export const CODIGO_EXPIRA_MS = 10 * 60_000;

/** Código de 6 dígitos, de "000000" a "999999", com o gerador criptográfico do Node. */
export function gerarCodigo(): string {
  return String(randomInt(0, 10 ** DIGITOS_DO_CODIGO)).padStart(DIGITOS_DO_CODIGO, '0');
}

/**
 * Hash SHA-256 do código, misturado ao telefone: o mesmo código em dois telefones dá hashes
 * diferentes. O código em si nunca vai para o banco.
 */
export function hashDoCodigo(telefoneHmac: string, codigo: string): string {
  return createHash('sha256').update(`${telefoneHmac}:${codigo}`).digest('hex');
}

/**
 * Guarda o hash do código do telefone, válido por 10 minutos, e zera as tentativas. Um código
 * novo para o mesmo telefone substitui o anterior: só vale o último enviado.
 */
export async function guardarCodigo(
  db: Db,
  {
    telefoneHmac,
    codigo,
    agora = new Date(),
  }: { telefoneHmac: string; codigo: string; agora?: Date },
): Promise<{ expiraEm: Date }> {
  const valores = {
    codigoHash: hashDoCodigo(telefoneHmac, codigo),
    expiraEm: new Date(agora.getTime() + CODIGO_EXPIRA_MS),
    tentativas: 0,
  };
  await db
    .insert(codigosVerificacao)
    .values({ telefoneHmac, ...valores })
    .onConflictDoUpdate({ target: codigosVerificacao.telefoneHmac, set: valores });
  return { expiraEm: valores.expiraEm };
}
