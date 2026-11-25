// Só o endereço da lista, sem depender do domínio: a busca (componente de navegador) usa isto.

export interface ParametrosDaListaDoPainel {
  situacoes: readonly string[];
  pendencias: readonly string[];
  q: string;
}

/**
 * Endereço de `/pautas` com os filtros. Sem situação ("Todas") é o padrão e não precisa de
 * parâmetro; com situação, `status=a,b`. `status=todas` continua valendo para links antigos.
 */
export function urlDaLista({ situacoes, pendencias, q }: ParametrosDaListaDoPainel): string {
  const partes: string[] = [];
  if (situacoes.length > 0) partes.push(`status=${situacoes.join(',')}`);
  if (pendencias.length > 0) partes.push(`pendencia=${pendencias.join(',')}`);
  if (q.trim() !== '') partes.push(`q=${encodeURIComponent(q.trim())}`);
  return partes.length === 0 ? '/pautas' : `/pautas?${partes.join('&')}`;
}

/** Duas buscas são a mesma quando só diferem nos espaços das pontas (a URL guarda a busca aparada). */
export const mesmaBusca = (a: string, b: string): boolean => a.trim() === b.trim();
