// O título não tem limite de tamanho no domínio, e o satori (por trás do `next/og`) não corta texto
// com `lineClamp`. Sem corte, um título longo empurra o card para cima do logo.

const LIMITE = 90;
const LIMITE_FONTE_GRANDE = 50;

/** Título que cabe no card: até `limite` (90) caracteres, cortado na última palavra inteira, com "…". */
export function tituloDoCard(titulo: string, limite = LIMITE): string {
  const letras = Array.from(titulo.trim());
  if (letras.length <= limite) return letras.join('');
  const corte = letras.slice(0, limite).join('');
  const espaco = corte.lastIndexOf(' ');
  return `${(espaco > 0 ? corte.slice(0, espaco) : corte).replace(/[\s,.;:–-]+$/u, '')}…`;
}

/** Fonte do título em px: menor para título longo, para caber em até 5 linhas. */
export function fonteDoTitulo(titulo: string): number {
  return Array.from(titulo).length <= LIMITE_FONTE_GRANDE ? 84 : 68;
}
