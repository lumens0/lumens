/**
 * Remove acentos, caixa, espaços das pontas e a pontuação do fim: "Cancelar." e "1)" valem
 * como "cancelar" e "1".
 */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[\s.!?,;:)\]-]+$/u, '');
}

/** Pergunta que abre o fluxo de pauta nova (2.6), pelo menu ou vindo de um relato (2.5). */
export const NEW_TITLE_TEXT = 'Qual o título da sua pauta?';
