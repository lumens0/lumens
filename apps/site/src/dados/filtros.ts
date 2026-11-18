/** Monta a URL da home preservando os filtros ativos. */
export function urlDosFiltros(status?: string, bloco?: string): string {
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (bloco) query.set('bloco', bloco);
  return query.size ? `/?${query.toString()}` : '/';
}
