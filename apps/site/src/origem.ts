import { ORIGEM_SITE_PRODUCAO as PRODUCAO } from '@lumens/contratos';

/** URL absoluta (com esquema) ou `null`, sem lançar: um valor mal escrito não pode derrubar a página. */
function urlOuNulo(valor: string | undefined): URL | null {
  if (!valor?.trim()) return null;
  try {
    // `localhost:3000` não lança: vira esquema `localhost:`. Só http(s) serve de origem.
    const url = new URL(valor.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** Host sem esquema (como a Vercel entrega) para URL HTTPS, ou `null`. */
function https(host: string | undefined): URL | null {
  return host?.trim() ? urlOuNulo(`https://${host.trim()}`) : null;
}

/**
 * Origem pública do site, base das URLs absolutas dos metadados (`og:image` precisa de uma: o
 * WhatsApp não resolve caminho relativo). Ordem: `LUMENS_SITE_URL`; no deploy de produção da
 * Vercel, o domínio de produção (`VERCEL_PROJECT_PRODUCTION_URL`); senão o deploy atual
 * (`VERCEL_URL`, para a prévia de um deploy de preview apontar para ele); senão produção.
 *
 * Em produção não serve `VERCEL_URL`: é a URL do deploy (`lumens-<hash>-….vercel.app`), que a
 * Deployment Protection responde com 302 para o login, e o WhatsApp mostra a prévia sem imagem.
 */
export function origemDoSite(env: NodeJS.ProcessEnv = process.env): URL {
  return (
    urlOuNulo(env.LUMENS_SITE_URL) ??
    (env.VERCEL_ENV === 'production' ? https(env.VERCEL_PROJECT_PRODUCTION_URL) : null) ??
    https(env.VERCEL_URL) ??
    new URL(PRODUCAO)
  );
}
