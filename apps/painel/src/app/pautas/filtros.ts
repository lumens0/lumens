import type { PendenciaDaCuradoria } from '@lumens/dominio';
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

export { urlDaLista, type ParametrosDaListaDoPainel } from './url-da-lista';

/** Liga ou desliga um item de uma lista, sem mudar a ordem dos outros. */
export function alternar<T>(lista: readonly T[], item: T): T[] {
  return lista.includes(item) ? lista.filter((outro) => outro !== item) : [...lista, item];
}
