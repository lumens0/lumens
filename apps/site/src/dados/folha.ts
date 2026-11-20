import type { StatusPublico } from '@lumens/contratos';
import type { Bloco, Pauta } from './tipos';

/** Texto sem acento e em minúsculas, para a busca não depender de como a pessoa digita. */
export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export interface BlocoDaFolha {
  slug: string;
  nome: string;
  sigla: string;
  /** Pautas do bloco na etapa filtrada (todas, sem filtro de etapa). */
  pautas: number;
}

/**
 * Todos os blocos do campus para os chips da folha: os que têm pauta primeiro (mais pautas antes),
 * depois os que não têm, cada grupo em ordem alfabética no empate.
 */
export function blocosDaFolha(
  blocos: readonly Pick<Bloco, 'slug' | 'nome'>[],
  siglas: Readonly<Record<string, string>>,
  pautas: readonly Pick<Pauta, 'status' | 'bloco_slug'>[],
  status: readonly StatusPublico[],
): BlocoDaFolha[] {
  return blocos
    .map((bloco) => ({
      slug: bloco.slug,
      nome: bloco.nome,
      sigla: siglas[bloco.slug] ?? bloco.nome,
      pautas: pautas.filter(
        (p) =>
          p.bloco_slug === bloco.slug &&
          (status.length === 0 || status.some((etapa) => etapa === p.status)),
      ).length,
    }))
    .sort((a, b) => b.pautas - a.pautas || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Busca por nome ou sigla do bloco, sem acento e sem diferenciar maiúsculas. */
export function buscarNaFolha(blocos: readonly BlocoDaFolha[], texto: string): BlocoDaFolha[] {
  const busca = semAcento(texto);
  if (busca === '') return [...blocos];
  return blocos.filter(
    (b) => semAcento(b.nome).includes(busca) || semAcento(b.sigla).includes(busca),
  );
}

const plural = (n: number, um: string, varios: string) => `${String(n)} ${n === 1 ? um : varios}`;

/** Frase de resumo da folha. Sem escolha, ela vira o aviso de que é preciso escolher um bloco. */
export function resumoDaFolha(escolhidos: readonly BlocoDaFolha[]): string {
  if (escolhidos.length === 0) return 'Escolha ao menos um bloco para filtrar.';
  const pautas = escolhidos.reduce((soma, b) => soma + b.pautas, 0);
  return `${plural(escolhidos.length, 'bloco escolhido', 'blocos escolhidos')} · ${plural(pautas, 'pauta', 'pautas')}`;
}

/** Texto do botão final: bloqueado sem escolha, e com o número de blocos quando há. */
export function textoDoBotaoDaFolha(quantos: number): string {
  return quantos === 0
    ? 'Escolha um bloco para continuar'
    : `Filtrar por ${plural(quantos, 'bloco', 'blocos')}`;
}
