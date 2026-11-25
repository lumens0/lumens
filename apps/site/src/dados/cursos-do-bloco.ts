import { CATEGORIAS, categoriaAbertaATodos, ehCategoria, type Categoria } from '@lumens/contratos';
import { buscarBlocos } from './api';

/**
 * Quem pode apoiar a pauta (SCRUM-399), dito na própria página: a regra aparece antes de a pessoa
 * tentar, porque o apoio de quem é de outro curso é recusado. `undefined` (não se sabe os cursos do
 * bloco) não escreve nada, para a página não afirmar o que não conferiu.
 */
export function fraseDosCursosDaPauta(
  blocoSlug: string | null,
  cursos: readonly string[] | undefined,
  categoria?: string,
): string | null {
  if (categoriaAbertaATodos(categoria)) {
    const rotulo = ehCategoria(categoria ?? '') ? CATEGORIAS[categoria as Categoria] : 'campus';
    return `Pauta de ${rotulo.toLowerCase()} é de todos: qualquer estudante verificado pode apoiar.`;
  }
  if (blocoSlug === null)
    return 'Pauta do campus inteiro: qualquer estudante verificado pode apoiar.';
  if (cursos === undefined) return null;
  if (cursos.length === 0) return 'Aberta a qualquer estudante verificado.';
  return `Só apoiam estudantes de: ${cursos.join(', ')}.`;
}

/**
 * Os cursos do bloco, ou `undefined` quando não se sabe: a API de blocos não respondeu, o bloco não
 * veio, ou a API ainda é a antiga, sem o campo `cursos` (site publicado antes do backend). Nesses
 * casos a página não escreve nada, em vez de afirmar que o bloco é aberto.
 */
export async function cursosDoBloco(
  blocoSlug: string | null,
): Promise<readonly string[] | undefined> {
  if (blocoSlug === null) return undefined;
  try {
    const bloco = (await buscarBlocos()).find((b) => b.slug === blocoSlug);
    return bloco?.cursos;
  } catch {
    return undefined;
  }
}
