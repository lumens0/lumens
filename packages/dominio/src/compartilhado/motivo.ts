/**
 * Motivo digitado pela curadoria numa recusa (de foto, de pedido de edição): vai pelo bot a quem
 * enviou, então precisa caber numa mensagem e numa variável de modelo do WhatsApp.
 */

/** Teto, em caracteres como a pessoa conta. */
export const MOTIVO_MAXIMO = 200;

/**
 * O motivo sem espaços nas pontas, ou `undefined` se não serve: vazio, mais longo que o teto ou com
 * quebra de linha ou outro caractere de controle (a Meta recusa parâmetro assim).
 */
export function motivoValido(texto: string): string | undefined {
  const limpo = texto.trim();
  if (limpo === '' || Array.from(limpo).length > MOTIVO_MAXIMO) return undefined;
  return /[\p{Cc}\p{Zl}\p{Zp}]/u.test(limpo) ? undefined : limpo;
}
