/**
 * URL pública da foto de um relato. Ponto de extensão: o armazenamento das fotos (T20, SCRUM-93)
 * ainda não tem endereço público, então por ora não há imagem.
 */
export function urlFoto(_chave: string): string | null {
  return null;
}

const LIMITE_ALT = 120;

/** Texto alternativo da foto: o próprio relato, cortado se for longo. */
export function altDaFoto(texto: string): string {
  const limpo = texto.trim().replace(/\s+/g, ' ');
  const base = limpo.length > LIMITE_ALT ? `${limpo.slice(0, LIMITE_ALT - 1).trimEnd()}…` : limpo;
  return `Foto do relato: ${base}`;
}
