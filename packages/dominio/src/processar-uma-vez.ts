/**
 * RNF07: a mesma mensagem do WhatsApp recebida mais de uma vez não gera dois apoios nem duas
 * respostas. A Meta reenvia o webhook quando não recebe o 200 a tempo, e pode entregar duas
 * cópias ao mesmo tempo.
 *
 * São duas camadas. Esta é a primeira: a chave da mensagem entra em `mensagem_processada` na
 * mesma transação da ação. A segunda são as chaves primárias de `apoio`, `voluntario` e
 * `resposta_conferencia`, que seguram a duplicidade mesmo se algo escapar daqui.
 */
import { mensagensProcessadas, type Db, type Tx } from '@lumens/db';

export type ResultadoProcessamento<T> =
  | { processada: true; resultado: T }
  /** A mensagem já foi processada (ou está sendo, por outra cópia que chegou junto). */
  | { processada: false; motivo: 'duplicada' };

/**
 * Roda `acao` uma vez só por mensagem. `wamidHmac` é a chave que a tabela guarda: o HMAC do
 * wamid, já calculado por quem chama (o wamid em claro contém o telefone).
 *
 * Abre a própria transação, ao contrário das outras regras: o registro da mensagem e a ação têm
 * de valer ou sumir juntos. Se a ação lançar, o rollback desfaz o registro e o reenvio da Meta é
 * processado. Duas cópias simultâneas: a segunda espera a primeira no INSERT (a chave primária
 * segura) e volta como duplicada sem rodar a ação.
 *
 * Resposta ao estudante sai só depois que esta função devolver, ou seja, depois do commit: a
 * ação grava o que precisa (ou põe o envio na fila, na mesma `tx`), nunca chama a Meta.
 */
export async function processarUmaVez<T>(
  db: Db,
  wamidHmac: string,
  acao: (tx: Tx) => Promise<T>,
): Promise<ResultadoProcessamento<T>> {
  return db.transaction(async (tx) => {
    const inseridas = await tx
      .insert(mensagensProcessadas)
      .values({ wamidHmac })
      .onConflictDoNothing()
      .returning({ wamidHmac: mensagensProcessadas.wamidHmac });
    if (inseridas.length === 0) return { processada: false, motivo: 'duplicada' };
    return { processada: true, resultado: await acao(tx) };
  });
}
