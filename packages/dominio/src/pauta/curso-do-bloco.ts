/**
 * SCRUM-399 · O curso do estudante serve ao bloco da pauta?
 *
 * A meta de uma pauta é 10% dos estudantes do bloco, somados pelos cursos dele. Para essa conta
 * fazer sentido, só conta apoio de quem é desses cursos. O vínculo está em `bloco_curso`:
 *
 * - bloco com cursos (IC, ICHCA, CTEC...): só estudante de um deles;
 * - bloco sem cursos (Biblioteca, RU, blocos de aula...): qualquer estudante verificado;
 * - pauta do campus inteiro (sem bloco): qualquer estudante verificado.
 *
 * Problema do campus é de todos: o campus é um espaço público e a reitoria precisa resolver, então
 * pauta de infraestrutura, segurança ou acessibilidade (`CATEGORIAS_ABERTAS_A_TODOS`) é aberta a
 * qualquer estudante verificado, em qualquer bloco. Pauta ainda sem categoria (`a_classificar`) não
 * conta como aberta.
 *
 * Estudante sem curso cadastrado não serve a bloco com cursos. O curso vem de `CURSOS`, escolhido
 * na verificação (2.4), então a comparação é pelo nome exato.
 */
import { categoriaAbertaATodos } from '@lumens/contratos';
import { blocoCursos, eq, type Db, type Tx } from '@lumens/db';

export async function cursoServeAoBloco(
  tx: Db | Tx,
  {
    blocoId,
    curso,
    categoria,
  }: { blocoId: string | null; curso: string | null; categoria?: string | null | undefined },
): Promise<boolean> {
  if (blocoId === null || categoriaAbertaATodos(categoria)) return true;
  const cursosDoBloco = await tx
    .select({ curso: blocoCursos.curso })
    .from(blocoCursos)
    .where(eq(blocoCursos.blocoId, blocoId));
  if (cursosDoBloco.length === 0) return true;
  return curso !== null && cursosDoBloco.some((c) => c.curso === curso);
}
