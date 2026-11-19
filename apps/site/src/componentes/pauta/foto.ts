/** Chave que o bot grava: `fotos/AAAA/MM/<uuid>.<ext>`. Qualquer outra coisa não vira endereço. */
const CHAVE_DE_FOTO = /^fotos\/\d{4}\/\d{2}\/[A-Za-z0-9_-]+\.[a-z0-9]{1,5}$/;

/**
 * Endereço da foto de um relato aprovado (SCRUM-263). Passa pela rota `/fotos` do próprio site,
 * que pede ao back-end: ele só entrega a foto que está na view pública, então o storage não
 * precisa de endereço aberto. Chave fora do formato não vira `src`.
 */
export function urlFoto(chave: string): string | null {
  return CHAVE_DE_FOTO.test(chave) ? `/${chave}` : null;
}

const LIMITE_ALT = 120;

/**
 * Texto alternativo da foto: o próprio relato, cortado se for longo. Com mais de uma foto no mesmo
 * relato, diz qual é (`Foto 2 de 3 do relato`), para quem usa leitor de tela distinguir as imagens.
 */
export function altDaFoto(texto: string, posicao = 1, total = 1): string {
  const limpo = texto.trim().replace(/\s+/g, ' ');
  const base = limpo.length > LIMITE_ALT ? `${limpo.slice(0, LIMITE_ALT - 1).trimEnd()}…` : limpo;
  const qual =
    total > 1 ? `Foto ${String(posicao)} de ${String(total)} do relato` : 'Foto do relato';
  return `${qual}: ${base}`;
}
