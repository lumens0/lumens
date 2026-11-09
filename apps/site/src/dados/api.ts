import type { PautaDetalhe } from '@lumens/contratos';

/** Endereço da API de leitura. Só no servidor: a variável não tem `NEXT_PUBLIC`. */
function urlDaApi(): string {
  const url = process.env.LUMENS_API_URL;
  if (!url) {
    throw new Error('LUMENS_API_URL não configurada: o site não sabe onde está a API de leitura.');
  }
  return url.replace(/\/+$/, '');
}

/**
 * Uma pauta pública pelo slug. `null` quando a API responde 404 (não existe ou não é pública)
 * ou 400 (slug mal formado). Qualquer outro erro sobe e cai no `error.tsx`.
 * O cache de 30 s acompanha o `Cache-Control` da API.
 */
export async function buscarPauta(slug: string): Promise<PautaDetalhe | null> {
  const resposta = await fetch(`${urlDaApi()}/pautas/${encodeURIComponent(slug)}`, {
    next: { revalidate: 30 },
  });
  if (resposta.status === 404 || resposta.status === 400) return null;
  if (!resposta.ok)
    throw new Error(`API de leitura respondeu ${String(resposta.status)} para a pauta.`);
  return (await resposta.json()) as PautaDetalhe;
}
