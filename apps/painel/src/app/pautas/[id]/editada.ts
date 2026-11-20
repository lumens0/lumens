import { CATEGORIAS, type EventoDaLinha } from '@lumens/dominio';

/**
 * Categoria que já vem marcada na decisão: a de quem relatou (o bot sugere e a pessoa confirma).
 * Sem categoria válida (`a_classificar` ou valor fora da lista), nada vem marcado e a curadoria
 * precisa escolher.
 */
export function categoriaDeQuemRelatou(categoria: string): string {
  return Object.hasOwn(CATEGORIAS, categoria) ? categoria : '';
}

/**
 * O responsável editou o título ou a descrição desta pauta depois de criada. Enquanto a pauta
 * espera a decisão, isso vira aviso: a versão que está na tela é a atual, e vale reler antes de
 * aprovar. (O bloqueio de verdade, por versão do texto, já existe: `textoVisto`.)
 */
export function textoFoiEditado(eventos: readonly Pick<EventoDaLinha, 'tipo'>[]): boolean {
  return eventos.some((evento) => evento.tipo === 'pauta_editada');
}
