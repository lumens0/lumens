/**
 * Direito de sair (LGPD, RNF03): a pessoa deixa o Lumens e o que a identifica é apagado. O que ela
 * fez continua valendo: apoios, respostas de conferência e inscrições como voluntária seguem
 * contando, ligados a uma linha de `estudante` que não diz mais de quem é.
 *
 * Relatos (SCRUM-314): os que não foram publicados
 * (pendentes ou recusados) são apagados, e as fotos deles também. Os aprovados, que já estão no site
 * sem nome, ficam, assim como os PDFs de resposta oficial, que são o registro da cobrança da pauta.
 */
import { randomUUID } from 'node:crypto';
import {
  and,
  codigosVerificacao,
  conversas,
  disparos,
  eq,
  estudantes,
  inArray,
  isNull,
  or,
  papeisPauta,
  pedidosEdicao,
  relatoFotos,
  relatos,
  type Tx,
} from '@lumens/db';
import { registrarEvento } from '../compartilhado/eventos';

/** Começa a lápide do telefone; um HMAC de verdade é hexadecimal e nunca começa assim. */
const PREFIXO_LAPIDE = 'saiu:';

export type ResultadoSaida =
  | {
      saiu: true;
      /** Pautas em que a pessoa era owner ou co-owner: a vaga abriu e a parte 3 pode oferecê-la. */
      pautasComVaga: string[];
      /**
       * Fotos dos relatos não publicados que foram apagados (SCRUM-314). O arquivo está no storage,
       * fora do banco: quem chama o remove.
       */
      fotosParaApagar: string[];
    }
  /** `ja_saiu`: sair de novo não muda nada nem repete evento. */
  | { saiu: false; motivo: 'estudante_inexistente' | 'ja_saiu' };

/**
 * Tira a pessoa do Lumens na transação de quem chama. Recusas voltam como resultado, sem exceção.
 *
 * Apaga o telefone, o e-mail cifrado, a conversa em andamento e o código de verificação;
 * preenche `saiu_em`; encerra os papéis de owner/co-owner com um `owner_removido` por pauta (o
 * evento leva só o papel, nunca quem saiu). `curso` e `verificado_em` ficam: o curso aparece nos
 * apoios e relatos públicos. Apaga os relatos não publicados e devolve as fotos deles. `apoio`,
 * `resposta_conferencia`, `voluntario`, os relatos aprovados e os PDFs de resposta não são tocados.
 *
 * `telefone_hmac` e `telefone_cifrado` são NOT NULL (e o HMAC é UNIQUE), então recebem uma lápide
 * aleatória (`saiu:<uuid>`): não deriva do telefone, não tem volta e nunca coincide com um HMAC de
 * verdade, que é hexadecimal. Buscar pelo HMAC do telefone não acha mais ninguém.
 *
 * O HMAC do e-mail fica (SCRUM-331). Ele não revela o
 * e-mail e serve só para, na volta, `vincularEmail` reativar esta mesma linha em vez de criar
 * outra: sem isso, sair e voltar com o mesmo e-mail permitia apoiar, se voluntariar e responder à
 * conferência de novo, e uma pessoa sozinha batia a meta de uma pauta.
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
  // Quem saiu tem a lápide no lugar do telefone. `saiu_em` preenchido com o telefone de verdade é
  // quem voltou (`vincularEmail`) e ainda não escolheu o curso (`concluirVerificacao`): o vínculo
  // está restaurado, então o `sair` vale e apaga de novo (SCRUM-331).
  if (estudante.saiuEm !== null && estudante.telefoneHmac.startsWith(PREFIXO_LAPIDE)) {
    return { saiu: false, motivo: 'ja_saiu' };
  }

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

  // SCRUM-314: relato que não foi publicado (pendente ou recusado) só existe para a curadoria; sem a
  // pessoa, não tem por que ficar. O aprovado já está no site, sem nome, e continua. Das fotos do
  // relato aprovado só ficam as aprovadas: a recusada nunca foi ao ar e sai com a pessoa.
  const doEstudante = tx
    .select({ id: relatos.id })
    .from(relatos)
    .where(
      and(
        eq(relatos.estudanteId, estudanteId),
        inArray(relatos.moderacao, ['pendente', 'recusado']),
      ),
    );
  const fotosApagadas = await tx
    .delete(relatoFotos)
    .where(
      or(
        inArray(relatoFotos.relatoId, doEstudante),
        and(
          eq(relatoFotos.moderacao, 'recusado'),
          inArray(
            relatoFotos.relatoId,
            tx.select({ id: relatos.id }).from(relatos).where(eq(relatos.estudanteId, estudanteId)),
          ),
        ),
      ),
    )
    .returning({ chave: relatoFotos.chave });
  await tx
    .delete(relatos)
    .where(
      and(
        eq(relatos.estudanteId, estudanteId),
        inArray(relatos.moderacao, ['pendente', 'recusado']),
      ),
    );
  // Pedido de edição que a curadoria não aprovou guarda texto de quem saiu: sai junto.
  await tx
    .delete(pedidosEdicao)
    .where(
      and(
        eq(pedidosEdicao.estudanteId, estudanteId),
        inArray(pedidosEdicao.status, ['pendente', 'recusado']),
      ),
    );
  const fotosParaApagar = fotosApagadas.map((f) => f.chave);

  // ponytail: lápide no lugar de NULL porque as colunas do telefone são NOT NULL; gravar NULL
  // depende de uma migração que as torne anuláveis.
  const lapide = `${PREFIXO_LAPIDE}${randomUUID()}`;
  await tx
    .update(estudantes)
    .set({
      telefoneHmac: lapide,
      telefoneCifrado: lapide,
      // SCRUM-331: o `email_hmac` fica (veja o comentário da função); o e-mail cifrado sai.
      emailCifrado: null,
      ultimaMensagemEm: null,
      saiuEm: agora,
    })
    .where(eq(estudantes.id, estudanteId));

  // A linha do papel fica no histórico; sair é preencher `ate`, como em `removerOwnerInativo`.
  const encerrados = await tx
    .update(papeisPauta)
    .set({ ate: agora })
    .where(and(eq(papeisPauta.estudanteId, estudanteId), isNull(papeisPauta.ate)))
    .returning({
      pautaId: papeisPauta.pautaId,
      papel: papeisPauta.papel,
      desde: papeisPauta.desde,
    });
  // SCRUM-315: o UPDATE não garante a ordem das linhas (com o índice único de papel ativo, o plano
  // mudou). Ordena pela data em que a pessoa assumiu cada pauta: resultado e eventos estáveis.
  encerrados.sort((a, b) => a.desde.localeCompare(b.desde));

  for (const { pautaId, papel } of encerrados) {
    await registrarEvento(tx, { pautaId, tipo: 'owner_removido', dados: { papel }, origem: 'bot' });
  }

  return { saiu: true, pautasComVaga: encerrados.map((e) => e.pautaId), fotosParaApagar };
}
