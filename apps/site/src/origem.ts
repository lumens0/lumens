import { ORIGEM_SITE_PRODUCAO as PRODUCAO } from '@lumens/contratos';

/** URL absoluta (com esquema) ou `null`, sem lançar: um valor mal escrito não pode derrubar a página. */
function urlOuNulo(valor: string | undefined): URL | null {
  if (!valor?.trim()) return null;
  try {
    return new URL(valor.trim());
  } catch {
    return null;
  }
}

/**
 * Origem pública do site, base das URLs absolutas dos metadados (`og:image` precisa de uma: o
 * WhatsApp não resolve caminho relativo). Ordem: `LUMENS_SITE_URL`; senão o deploy atual da Vercel
 * (`VERCEL_URL`, para a prévia de um deploy de preview apontar para ele); senão produção.
 */
export function origemDoSite(env: NodeJS.ProcessEnv = process.env): URL {
  return (
    urlOuNulo(env.LUMENS_SITE_URL) ??
    (env.VERCEL_URL?.trim() ? urlOuNulo(`https://${env.VERCEL_URL.trim()}`) : null) ??
    new URL(PRODUCAO)
  );
}
