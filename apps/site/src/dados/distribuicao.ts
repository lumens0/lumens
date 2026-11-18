import { CATEGORIAS, ehCategoria } from '@lumens/contratos';
import type { Pauta } from './tipos';

export interface Grupo {
  chave: string;
  rotulo: string;
  total: number;
  /** Largura da barra, de 0 a 100, em relação ao grupo com mais pautas. */
  largura: number;
}

function agrupar(contagem: Map<string, { rotulo: string; total: number }>): Grupo[] {
  const grupos = [...contagem.entries()].map(([chave, { rotulo, total }]) => ({
    chave,
    rotulo,
    total,
  }));
  // Mais pautas primeiro; no empate, ordem alfabética, para a ordem não mudar entre acessos.
  grupos.sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  const maior = grupos[0]?.total ?? 0;
  return grupos.map((g) => ({
    ...g,
    largura: maior === 0 ? 0 : Math.round((g.total / maior) * 100),
  }));
}

/**
 * Pautas por categoria oficial (SCRUM-360). Categoria sem pauta fica de fora; pauta ainda não
 * classificada (`a_classificar` ou valor fora da lista) não tem rótulo público e não entra.
 */
export function pautasPorCategoria(pautas: readonly Pauta[]): Grupo[] {
  const contagem = new Map<string, { rotulo: string; total: number }>();
  for (const pauta of pautas) {
    const chave = pauta.categoria.trim();
    if (!ehCategoria(chave)) continue;
    const atual = contagem.get(chave) ?? { rotulo: CATEGORIAS[chave], total: 0 };
    contagem.set(chave, { ...atual, total: atual.total + 1 });
  }
  return agrupar(contagem);
}

/** Pautas por bloco; as de todo o campus (sem bloco) aparecem como "Todo o campus". */
export function pautasPorBloco(pautas: readonly Pauta[]): Grupo[] {
  const contagem = new Map<string, { rotulo: string; total: number }>();
  for (const pauta of pautas) {
    const chave = pauta.bloco_slug ?? '';
    const atual = contagem.get(chave) ?? { rotulo: pauta.bloco_nome ?? 'Todo o campus', total: 0 };
    contagem.set(chave, { ...atual, total: atual.total + 1 });
  }
  return agrupar(contagem);
}

export function resumoDosGrupos(grupos: readonly Grupo[], unidade: string): string {
  const total = grupos.reduce((soma, g) => soma + g.total, 0);
  const lider = grupos[0];
  if (total === 0 || !lider) return `Nenhuma pauta por ${unidade} ainda.`;
  return `${String(total)} ${total === 1 ? 'pauta' : 'pautas'}; mais pautas em ${lider.rotulo} (${String(lider.total)}).`;
}
