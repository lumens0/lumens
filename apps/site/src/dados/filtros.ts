/** Monta a URL da lista de pautas (`/pautas`) preservando os filtros ativos. */
export function urlDosFiltros(status?: string, bloco?: string): string {
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (bloco) query.set('bloco', bloco);
  return query.size ? `/pautas?${query.toString()}` : '/pautas';
}

/**
 * Link antigo com filtro na raiz (`/?bloco=x&status=y`): devolve o endereço equivalente em
 * `/pautas`, ou `undefined` quando a raiz veio sem filtro e deve continuar sendo o Início.
 * Só `bloco` e `status` com um valor de texto contam; o resto é ignorado.
 */
export function urlAntigaDosFiltros(params: {
  bloco?: string | string[] | undefined;
  status?: string | string[] | undefined;
}): string | undefined {
  const bloco = typeof params.bloco === 'string' && params.bloco ? params.bloco : undefined;
  const status = typeof params.status === 'string' && params.status ? params.status : undefined;
  return bloco || status ? urlDosFiltros(status, bloco) : undefined;
}
