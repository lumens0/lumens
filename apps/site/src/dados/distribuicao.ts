import { CATEGORIAS, ehCategoria } from '@lumens/contratos';
import type { Pauta } from './tipos';

export interface Grupo {
  chave: string;
  rotulo: string;
  /** Apoios somados das pautas do grupo. */
  total: number;
  /** Largura da barra, de 0 a 100, em relação ao grupo com mais apoios. */
  largura: number;
}

type Soma = Map<string, { rotulo: string; total: number }>;

function somar(soma: Soma, chave: string, rotulo: string, apoios: number): void {
  const atual = soma.get(chave) ?? { rotulo, total: 0 };
  soma.set(chave, { rotulo, total: atual.total + apoios });
}

function agrupar(soma: Soma, limite?: number): Grupo[] {
  const grupos = [...soma.entries()].map(([chave, { rotulo, total }]) => ({
    chave,
    rotulo,
    total,
  }));
  // Mais apoios primeiro; no empate, ordem alfabética, para a ordem não mudar entre acessos.
  grupos.sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  const maior = grupos[0]?.total ?? 0;
  return grupos
    .slice(0, limite)
    .map((g) => ({ ...g, largura: maior === 0 ? 0 : Math.round((g.total / maior) * 100) }));
}

/**
 * Apoios por categoria oficial (SCRUM-360). Pauta ainda não classificada (`a_classificar` ou valor
 * fora da lista) não tem rótulo público e não entra.
 */
export function apoiosPorCategoria(pautas: readonly Pauta[]): Grupo[] {
  const soma: Soma = new Map();
  for (const pauta of pautas) {
    const chave = pauta.categoria.trim();
    if (ehCategoria(chave)) somar(soma, chave, CATEGORIAS[chave], pauta.apoios);
  }
  return agrupar(soma);
}

/** Blocos com mais apoios; as pautas de todo o campus (sem bloco) não contam para nenhum bloco. */
export function blocosMaisAtivos(pautas: readonly Pauta[], limite = 5): Grupo[] {
  const soma: Soma = new Map();
  for (const pauta of pautas) {
    if (pauta.bloco_slug !== null && pauta.bloco_nome !== null) {
      somar(soma, pauta.bloco_slug, pauta.bloco_nome, pauta.apoios);
    }
  }
  return agrupar(soma, limite);
}

export function resumoDosGrupos(grupos: readonly Grupo[], vazio: string): string {
  const total = grupos.reduce((soma, g) => soma + g.total, 0);
  const lider = grupos[0];
  if (total === 0 || !lider) return vazio;
  return `${String(total)} ${total === 1 ? 'apoio' : 'apoios'}; o maior é ${lider.rotulo} (${String(lider.total)}).`;
}
