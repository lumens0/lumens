/**
 * Direito de sair (LGPD, RNF03): a pessoa deixa o Lumens e o que a identifica é apagado. O que ela
 * fez continua valendo: apoios, respostas de conferência e inscrições como voluntária seguem
 * contando, ligados a uma linha de `estudante` que não diz mais de quem é.
 */
import { randomUUID } from 'node:crypto';
import {
  and,
  codigosVerificacao,
  conversas,
  disparos,
  eq,
  estudantes,
  isNull,
  papeisPauta,
  type Tx,
} from '@lumens/db';
import { registrarEvento } from './eventos';

export type ResultadoSaida =
  | {
      saiu: true;
      /** Pautas em que a pessoa era owner ou co-owner: a vaga abriu e a parte 3 pode oferecê-la. */
      pautasComVaga: string[];
    }
  /** `ja_saiu`: sair de novo não muda nada nem repete evento. */
  | { saiu: false; motivo: 'estudante_inexistente' | 'ja_saiu' };

/**
 * Tira a pessoa do Lumens na transação de quem chama. Recusas voltam como resultado, sem exceção.
 *
 * Apaga telefone e e-mail (cifrado e HMAC), a conversa em andamento e o código de verificação;
 * preenche `saiu_em`; encerra os papéis de owner/co-owner com um `owner_removido` por pauta (o
 * evento leva só o papel, nunca quem saiu). `curso` e `verificado_em` ficam: o curso aparece nos
 * apoios e relatos públicos. `apoio`, `resposta_conferencia`, `voluntario` e `relato` não são
 * tocados.
 *
 * `telefone_hmac` e `telefone_cifrado` são NOT NULL (e o HMAC é UNIQUE), então recebem uma lápide
 * aleatória (`saiu:<uuid>`): não deriva do telefone, não tem volta e nunca coincide com um HMAC de
 * verdade, que é hexadecimal. Buscar pelo HMAC do telefone não acha mais ninguém.
 *
 * Limitação conhecida: quem volta com o mesmo telefone se verifica como estudante novo e pode
 * apoiar de novo as pautas que já apoiou (o apoio antigo segue contando na linha sem identidade).
 */
export async function sairDoLumens(
  tx: Tx,
  { estudanteId, agora = new Date() }: { estudanteId: string; agora?: Date },
): Promise<ResultadoSaida> {
  // FOR UPDATE no estudante: de duas saídas simultâneas, a segunda espera a primeira e encontra
  // `saiu_em` preenchido, sem repetir evento.
  const [estudante] = await tx
    .select({ telefoneHmac: estudantes.telefoneHmac, saiuEm: estudantes.saiuEm })
    .from(estudantes)
    .where(eq(estudantes.id, estudanteId))
    .for('update');

  if (estudante === undefined) return { saiu: false, motivo: 'estudante_inexistente' };
  if (estudante.saiuEm !== null) return { saiu: false, motivo: 'ja_saiu' };

  // Conversa e código são chaveados pelo HMAC do telefone: saem antes de ele ser trocado.
  await tx.delete(conversas).where(eq(conversas.telefoneHmac, estudante.telefoneHmac));
  await tx
    .delete(codigosVerificacao)
    .where(eq(codigosVerificacao.telefoneHmac, estudante.telefoneHmac));

  // Disparos pendentes ou já reservados são cancelados para impedir envios após a saída (LGPD).
  // O worker só avança no lote com renovarReserva (onde falhouEm precisa ser nulo).
  await tx
    .update(disparos)
    .set({ falhouEm: agora, falha: 'estudante_saiu' })
    .where(
      and(
        eq(disparos.estudanteId, estudanteId),
        isNull(disparos.enviadoEm),
        isNull(disparos.falhouEm),
      ),
    );

  // ponytail: lápide no lugar de NULL porque as colunas do telefone são NOT NULL; gravar NULL
  // depende de uma migração que as torne anuláveis.
  const lapide = `saiu:${randomUUID()}`;
  await tx
    .update(estudantes)
    .set({
      telefoneHmac: lapide,
      telefoneCifrado: lapide,
      emailHmac: null,
      emailCifrado: null,
      saiuEm: agora,
    })
    .where(eq(estudantes.id, estudanteId));

  // A linha do papel fica no histórico; sair é preencher `ate`, como em `removerOwnerInativo`.
  const encerrados = await tx
    .update(papeisPauta)
    .set({ ate: agora })
    .where(and(eq(papeisPauta.estudanteId, estudanteId), isNull(papeisPauta.ate)))
    .returning({ pautaId: papeisPauta.pautaId, papel: papeisPauta.papel });

  for (const { pautaId, papel } of encerrados) {
    await registrarEvento(tx, { pautaId, tipo: 'owner_removido', dados: { papel }, origem: 'bot' });
  }

  return { saiu: true, pautasComVaga: encerrados.map((e) => e.pautaId) };
}
