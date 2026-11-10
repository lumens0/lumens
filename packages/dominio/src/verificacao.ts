/**
 * RF-B04 · RN01 · Verificação pelo e-mail institucional (história 2.4).
 *
 * Só e-mail da UFAL prova que a pessoa é estudante: o domínio tem de ser `ufal.br` ou um
 * subdomínio dele (`ic.ufal.br`, `ctec.ufal.br`...). Função pura: o bot chama com a mensagem da
 * pessoa e transforma o motivo da recusa numa resposta.
 */

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
