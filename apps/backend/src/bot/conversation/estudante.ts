/**
 * O estudante por trás de um telefone: só quem é verificado e não saiu (RN01) cria pauta (2.6) ou
 * cuida dela (3.3). A verificação em si é a 2.4.
 */
import { blocos, eq, estudantes, type Db } from '@lumens/db';
import { cursoServeAoBloco } from '@lumens/dominio';

/**
 * A pessoa tem cadastro de estudante por este telefone (verificado ou não) e não saiu? É quem já
 * passou pelo aviso de privacidade (SCRUM-333): voltar depois de a conversa expirar não é primeiro
 * contato. Quem saiu tem uma lápide no lugar do telefone e não é achado: volta a ser primeiro contato.
 */
export async function temCadastro(db: Db, phoneHmac: string): Promise<boolean> {
  const [estudante] = await db
    .select({ saiuEm: estudantes.saiuEm })
    .from(estudantes)
    .where(eq(estudantes.telefoneHmac, phoneHmac));
  return estudante !== undefined && estudante.saiuEm === null;
}

export async function estudanteVerificado(db: Db, phoneHmac: string): Promise<string | undefined> {
  const [estudante] = await db
    .select({ id: estudantes.id, verificadoEm: estudantes.verificadoEm, saiuEm: estudantes.saiuEm })
    .from(estudantes)
    .where(eq(estudantes.telefoneHmac, phoneHmac));
  if (estudante === undefined) return undefined;
  return estudante.verificadoEm !== null && estudante.saiuEm === null ? estudante.id : undefined;
}

/**
 * SCRUM-399: o bloco recusa este estudante pelo curso? Devolve o nome do bloco, para o texto da
 * recusa, ou `undefined` quando ele pode (bloco aberto, campus inteiro, categoria de todos ou curso
 * do bloco). É só para avisar cedo, ao escolher a categoria e antes de a pessoa escrever a pauta: a
 * regra de verdade está no domínio (`criarPauta` e `registrarApoio`).
 */
export async function blocoQueRecusa(
  db: Db,
  estudanteId: string,
  blocoId: string | null,
  categoria?: string,
): Promise<string | undefined> {
  if (blocoId === null) return undefined;
  const [estudante] = await db
    .select({ curso: estudantes.curso })
    .from(estudantes)
    .where(eq(estudantes.id, estudanteId));
  if (await cursoServeAoBloco(db, { blocoId, curso: estudante?.curso ?? null, categoria }))
    return undefined;
  return await nomeDoBloco(db, blocoId);
}

export async function nomeDoBloco(db: Db, blocoId: string): Promise<string> {
  const [bloco] = await db.select({ nome: blocos.nome }).from(blocos).where(eq(blocos.id, blocoId));
  return bloco?.nome ?? 'bloco';
}
