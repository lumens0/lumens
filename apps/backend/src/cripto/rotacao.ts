import { eq, estudantes, type Db } from '@lumens/db';
import { cifrar, decifrar } from './cifra';

const PREFIXO_LAPIDE = 'saiu:';

/**
 * Rotaciona a chave de cifra AES-256-GCM dos dados sensíveis armazenados no banco.
 *
 * Atualiza (o e-mail dos curadores usa a CHAVE_CIFRA_PAINEL e fica de fora; veja
 * `recifrarEmailsDeCuradores` no domínio):
 * - `estudante.telefone_cifrado` (exceto se for lápide 'saiu:')
 * - `estudante.email_cifrado` (quando não nulo e exceto se for lápide 'saiu:')
 *
 * Executa em transação única. Se qualquer decifragem falhar, faz rollback automático.
 */
export async function rotacionarCifra(
  db: Db,
  chaveAntiga: Buffer,
  chaveNova: Buffer,
): Promise<{ estudantes: number }> {
  if (chaveAntiga.length !== 32 || chaveNova.length !== 32) {
    throw new Error('As chaves de cifra precisam ter exatamente 32 bytes.');
  }
  if (chaveAntiga.equals(chaveNova)) {
    throw new Error('A chave nova deve ser diferente da chave antiga.');
  }

  return await db.transaction(async (tx) => {
    let estudantesCount = 0;

    const listaEstudantes = await tx
      .select({
        id: estudantes.id,
        telefoneCifrado: estudantes.telefoneCifrado,
        emailCifrado: estudantes.emailCifrado,
      })
      .from(estudantes);

    for (const estudante of listaEstudantes) {
      const alteracoes: { telefoneCifrado?: string; emailCifrado?: string } = {};
      let alterou = false;

      if (!estudante.telefoneCifrado.startsWith(PREFIXO_LAPIDE)) {
        const telDecifrado = decifrar(estudante.telefoneCifrado, chaveAntiga);
        alteracoes.telefoneCifrado = cifrar(telDecifrado, chaveNova);
        alterou = true;
      }

      if (estudante.emailCifrado !== null && !estudante.emailCifrado.startsWith(PREFIXO_LAPIDE)) {
        const emailDecifrado = decifrar(estudante.emailCifrado, chaveAntiga);
        alteracoes.emailCifrado = cifrar(emailDecifrado, chaveNova);
        alterou = true;
      }

      if (alterou) {
        await tx.update(estudantes).set(alteracoes).where(eq(estudantes.id, estudante.id));
        estudantesCount++;
      }
    }

    return { estudantes: estudantesCount };
  });
}
