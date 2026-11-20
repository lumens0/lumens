import type { PautaDaCuradoria, PendenciaDaCuradoria } from '@lumens/dominio';
import { STATUS } from './status';

/** As pendências que a lista sabe filtrar, na ordem em que os chips aparecem. */
export const PENDENCIAS: readonly { valor: PendenciaDaCuradoria; rotulo: string }[] = [
  { valor: 'sem_resposta_oficial', rotulo: 'Sem resposta oficial' },
  { valor: 'conferencia_aberta', rotulo: 'Conferência aberta' },
];

type Situacao = keyof typeof STATUS;

const itensDaUrl = (param: string | undefined): string[] =>
  [...new Set((param ?? '').split(',').map((item) => item.trim()))].filter(Boolean);

/**
 * As situações pedidas na URL (`?status=a,b`). Sem o parâmetro, a lista abre em "esperando decisão",
 * como sempre; `todas` (ou valores que não existem) é a lista sem filtro de situação.
 */
export function situacoesDaUrl(param: string | undefined): Situacao[] {
  if (param === undefined) return ['em_curadoria'];
  return itensDaUrl(param).filter((item): item is Situacao => Object.hasOwn(STATUS, item));
}

/** As pendências pedidas na URL (`?pendencia=a,b`), na ordem dos chips; as desconhecidas saem. */
export function pendenciasDaUrl(param: string | undefined): PendenciaDaCuradoria[] {
  const pedidas = new Set(itensDaUrl(param));
  return PENDENCIAS.filter((p) => pedidas.has(p.valor)).map((p) => p.valor);
}

/** Sem acento, em minúsculas, sem espaço nas pontas: a busca não depende de como se digita. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Uma busca só: cada palavra tem de aparecer no título, no bloco ou na situação da pauta; a palavra
 * "urgente" acha as pautas urgentes. Sem acento e sem diferenciar maiúsculas.
 */
export function buscarNaLista(
  pautas: readonly PautaDaCuradoria[],
  texto: string,
): PautaDaCuradoria[] {
  const palavras = normalizar(texto).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [...pautas];
  return pautas.filter((pauta) => {
    const campos = [pauta.titulo, pauta.bloco ?? 'campus inteiro', STATUS[pauta.status]].map(
      normalizar,
    );
    return palavras.every((palavra) =>
      palavra === 'urgente' ? pauta.urgente : campos.some((campo) => campo.includes(palavra)),
    );
  });
}

/** "Ou" dentro das situações: a pauta fica se está em alguma delas (sem escolha, ficam todas). */
export function filtrarPorSituacoes(
  pautas: readonly PautaDaCuradoria[],
  situacoes: readonly string[],
): PautaDaCuradoria[] {
  return situacoes.length === 0 ? [...pautas] : pautas.filter((p) => situacoes.includes(p.status));
}

/** Junta listas de pautas sem repetir (a mesma pauta pode estar em duas pendências). */
export function uniaoDePautas(
  listas: readonly (readonly PautaDaCuradoria[])[],
): PautaDaCuradoria[] {
  const vistas = new Map<string, PautaDaCuradoria>();
  for (const pauta of listas.flat()) if (!vistas.has(pauta.id)) vistas.set(pauta.id, pauta);
  return [...vistas.values()];
}

export interface ParametrosDaListaDoPainel {
  situacoes: readonly string[];
  pendencias: readonly string[];
  q: string;
}

/**
 * Endereço de `/pautas` com os filtros. Sem situação, `status=todas` (sem o parâmetro a lista
 * voltaria a abrir em "esperando decisão"); a situação padrão sozinha não precisa de parâmetro.
 */
export function urlDaLista({ situacoes, pendencias, q }: ParametrosDaListaDoPainel): string {
  const partes: string[] = [];
  const padrao = situacoes.length === 1 && situacoes[0] === 'em_curadoria';
  if (!padrao) partes.push(`status=${situacoes.length === 0 ? 'todas' : situacoes.join(',')}`);
  if (pendencias.length > 0) partes.push(`pendencia=${pendencias.join(',')}`);
  if (q.trim() !== '') partes.push(`q=${encodeURIComponent(q.trim())}`);
  return partes.length === 0 ? '/pautas' : `/pautas?${partes.join('&')}`;
}

/** Liga ou desliga um item de uma lista, sem mudar a ordem dos outros. */
export function alternar<T>(lista: readonly T[], item: T): T[] {
  return lista.includes(item) ? lista.filter((outro) => outro !== item) : [...lista, item];
}
