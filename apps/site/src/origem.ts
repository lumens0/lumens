/** Produção. É também a origem padrão do CORS da API (`CORS_ORIGENS`). */
const PRODUCAO = 'https://lumens-ufal.vercel.app';

/**
 * Origem pública do site, base das URLs absolutas dos metadados (`og:image` precisa de uma: o
 * WhatsApp não resolve caminho relativo). Vem de `LUMENS_SITE_URL`; vazia, cai em produção.
 */
export function origemDoSite(valor = process.env.LUMENS_SITE_URL): URL {
  return new URL(valor?.trim() || PRODUCAO);
}
