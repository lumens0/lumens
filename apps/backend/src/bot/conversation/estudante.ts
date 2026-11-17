/**
 * O estudante por trás de um telefone: só quem é verificado e não saiu (RN01) cria pauta (2.6) ou
 * cuida dela (3.3). A verificação em si é a 2.4.
 */
import { eq, estudantes, type Db } from '@lumens/db';

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
