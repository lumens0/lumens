import { STATUS_PUBLICOS, type StatusPublico } from '@lumens/contratos';
import type { Bloco, Pauta } from './tipos';

/** Um parâmetro da URL como o Next entrega: texto, lista (parâmetro repetido) ou ausente. */
export type ParamDaUrl = string | string[] | undefined;

/** Filtros da lista de pautas: "ou" dentro de cada grupo, "e" entre os grupos. */
export interface Filtros {
  status: readonly StatusPublico[];
  blocos: readonly Bloco[];
}

/**
 * Lê um parâmetro de lista: `?bloco=a,b` e `?bloco=a&bloco=b` dão `['a', 'b']`. Ignora vazios e
 * repetidos, mantendo a ordem em que vieram.
 */
export function listaDaUrl(param: ParamDaUrl): string[] {
  const textos = Array.isArray(param) ? param : param === undefined ? [] : [param];
  const itens = textos.flatMap((texto) => texto.split(',')).map((item) => item.trim());
  return [...new Set(itens.filter((item) => item !== ''))];
}

/** Etapas públicas pedidas na URL, na ordem do caminho; valor desconhecido é ignorado. */
export function statusDaUrl(param: ParamDaUrl): StatusPublico[] {
  const pedidos = new Set(listaDaUrl(param));
  return STATUS_PUBLICOS.filter((etapa) => pedidos.has(etapa));
}

/** Blocos do catálogo pedidos na URL, na ordem do catálogo; slug desconhecido é ignorado. */
export function blocosDaUrl(blocos: readonly Bloco[], param: ParamDaUrl): Bloco[] {
  const pedidos = new Set(listaDaUrl(param));
  return blocos.filter((bloco) => pedidos.has(bloco.slug));
}

/** Liga ou desliga um item de uma lista de escolhas, sem mudar a ordem dos outros. */
export function alternar<T>(lista: readonly T[], item: T): T[] {
  return lista.includes(item) ? lista.filter((outro) => outro !== item) : [...lista, item];
}

/** Monta `base?status=a,b&bloco=c,d` com os filtros que existem; sem filtro, só a `base`. */
export function urlDeFiltros(
  base: string,
  { status = [], bloco = [] }: { status?: readonly string[]; bloco?: readonly string[] },
): string {
  const partes = [
    status.length > 0 ? `status=${status.map(encodeURIComponent).join(',')}` : '',
    bloco.length > 0 ? `bloco=${bloco.map(encodeURIComponent).join(',')}` : '',
  ].filter(Boolean);
  return partes.length > 0 ? `${base}?${partes.join('&')}` : base;
}

/** Monta a URL da lista de pautas (`/pautas`) com um bloco e uma etapa, como os seletores da lista. */
export function urlDosFiltros(status?: string, bloco?: string): string {
  return urlDeFiltros('/pautas', {
    status: status ? [status] : [],
    bloco: bloco ? [bloco] : [],
  });
}

/** Aplica os filtros: a pauta fica se está em alguma das etapas e em algum dos blocos escolhidos. */
export function filtrarPautas<T extends Pick<Pauta, 'status' | 'bloco_slug'>>(
  pautas: readonly T[],
  { status, blocos }: Filtros,
): T[] {
  return pautas.filter(
    (pauta) =>
      (status.length === 0 || status.some((etapa) => etapa === pauta.status)) &&
      (blocos.length === 0 || blocos.some((bloco) => bloco.slug === pauta.bloco_slug)),
  );
}
