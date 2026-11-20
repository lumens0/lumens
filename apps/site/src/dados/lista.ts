import type { StatusPublico } from '@lumens/contratos';
import { semAcento, type BlocoDaFolha } from './folha';
import { urlDeFiltros } from './filtros';
import type { Pauta } from './tipos';

/** Quantas pautas cada página da lista mostra. */
export const POR_PAGINA = 8;

export const ORDENS = ['atencao', 'apoios', 'recentes'] as const;
export type Ordem = (typeof ORDENS)[number];

export const ROTULO_DA_ORDEM: Record<Ordem, string> = {
  atencao: 'O que pede atenção',
  apoios: 'Mais apoios',
  recentes: 'Mais recentes',
};

/** A ordem pedida na URL; qualquer outra coisa cai na padrão, "o que pede atenção". */
export function ordemDaUrl(param: string | string[] | undefined): Ordem {
  return ORDENS.find((ordem) => ordem === param) ?? 'atencao';
}

// Do que mais pede atenção ao que menos: promessa quebrada, cobrança, promessa, meta batida...
const PRIORIDADE: readonly StatusPublico[] = [
  'descumprida',
  'cobrando',
  'prometido',
  'meta_batida',
  'entregue_em_parte',
  'juntando_apoios',
  'conquistada',
];

/**
 * Ordena sem mudar a lista de entrada. "O que pede atenção": urgente primeiro, depois pela etapa e
 * por apoios. No empate, o título decide, para a ordem não mudar entre acessos.
 */
export function ordenarPautas<T extends Pauta>(pautas: readonly T[], ordem: Ordem): T[] {
  const porTitulo = (a: T, b: T) => a.titulo.localeCompare(b.titulo, 'pt-BR');
  return [...pautas].sort((a, b) => {
    if (ordem === 'apoios') return b.apoios - a.apoios || porTitulo(a, b);
    if (ordem === 'recentes') return b.criada_em.localeCompare(a.criada_em) || porTitulo(a, b);
    return (
      Number(b.urgente) - Number(a.urgente) ||
      PRIORIDADE.indexOf(a.status as StatusPublico) -
        PRIORIDADE.indexOf(b.status as StatusPublico) ||
      b.apoios - a.apoios ||
      porTitulo(a, b)
    );
  });
}

/**
 * Busca única: cada palavra da busca tem de aparecer no título, no bloco (nome e sigla) ou na etapa
 * da pauta, sem acento e sem diferenciar maiúsculas. A palavra "urgente" acha as pautas urgentes.
 */
export function buscarNasPautas<T extends Pauta>(
  pautas: readonly T[],
  texto: string,
  siglas: Readonly<Record<string, string>>,
  rotuloDaEtapa: (status: T['status']) => string,
): T[] {
  const palavras = semAcento(texto).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [...pautas];
  return pautas.filter((pauta) => {
    const campos = [
      pauta.titulo,
      pauta.bloco_nome ?? '',
      siglas[pauta.bloco_slug ?? ''] ?? '',
      rotuloDaEtapa(pauta.status),
    ].map(semAcento);
    return palavras.every((palavra) =>
      palavra === 'urgente' ? pauta.urgente : campos.some((campo) => campo.includes(palavra)),
    );
  });
}

/**
 * Blocos cujo nome ou sigla contém o que a pessoa digitou, para oferecer "Filtrar pelo bloco: X".
 * Só com pelo menos duas letras, e no máximo `limite`, sem os que já estão escolhidos.
 */
export function sugestoesDeBloco(
  blocos: readonly BlocoDaFolha[],
  texto: string,
  escolhidos: readonly string[],
  limite = 6,
): BlocoDaFolha[] {
  const busca = semAcento(texto);
  if (busca.length < 2) return [];
  return blocos
    .filter(
      (b) =>
        !escolhidos.includes(b.slug) &&
        (semAcento(b.nome).includes(busca) || semAcento(b.sigla) === busca),
    )
    .slice(0, limite);
}

export interface Pagina<T> {
  itens: T[];
  /** Página mostrada, já dentro da faixa (de 1 até `paginas`). */
  pagina: number;
  paginas: number;
  total: number;
  /** Posição, a partir de 1, da primeira e da última pauta mostradas; 0 e 0 sem pauta. */
  de: number;
  ate: number;
}

/** Número da página na URL: inteiro positivo, senão a primeira. */
export function paginaDaUrl(param: string | string[] | undefined): number {
  const n = Number(typeof param === 'string' ? param : '1');
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** Fatia a lista em páginas. Uma página além da última cai na última. */
export function paginar<T>(lista: readonly T[], pedida: number, porPagina = POR_PAGINA): Pagina<T> {
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const pagina = Math.min(Math.max(1, pedida), paginas);
  const inicio = (pagina - 1) * porPagina;
  const itens = lista.slice(inicio, inicio + porPagina);
  return {
    itens,
    pagina,
    paginas,
    total: lista.length,
    de: itens.length === 0 ? 0 : inicio + 1,
    ate: inicio + itens.length,
  };
}

/**
 * Números dos botões da paginação: todos até 7 páginas; acima disso, a primeira, a última e a
 * vizinhança da atual, com "…" onde pula. Ex.: `[1, '…', 4, 5, 6, '…', 9]`.
 */
export function janelaDePaginas(pagina: number, paginas: number): (number | '…')[] {
  if (paginas <= 7) return Array.from({ length: paginas }, (_, i) => i + 1);
  const mostrar = new Set([1, paginas, pagina - 1, pagina, pagina + 1]);
  const numeros = [...mostrar].filter((n) => n >= 1 && n <= paginas).sort((a, b) => a - b);
  const saida: (number | '…')[] = [];
  numeros.forEach((n, i) => {
    const anterior = numeros[i - 1];
    if (anterior !== undefined && n - anterior > 1) saida.push('…');
    saida.push(n);
  });
  return saida;
}

export interface ParametrosDaLista {
  q?: string;
  ordem?: Ordem;
  status?: readonly string[];
  bloco?: readonly string[];
  pagina?: number;
}

/** Endereço de `/pautas` com os parâmetros que fogem do padrão (ordem padrão e página 1 saem). */
export function urlDaLista({ q, ordem, status, bloco, pagina }: ParametrosDaLista): string {
  const base = urlDeFiltros('/pautas', { status: status ?? [], bloco: bloco ?? [] });
  const extras = new URLSearchParams();
  if (q?.trim()) extras.set('q', q.trim());
  if (ordem && ordem !== 'atencao') extras.set('ordem', ordem);
  if (pagina && pagina > 1) extras.set('pagina', String(pagina));
  const resto = extras.toString();
  if (resto === '') return base;
  return `${base}${base.includes('?') ? '&' : '?'}${resto}`;
}
