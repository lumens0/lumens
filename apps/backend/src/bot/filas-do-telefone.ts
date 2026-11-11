/**
 * `sair` também tira o telefone das filas do bot (SCRUM-174).
 *
 * Cada mensagem recebida e cada resposta viram um job do pg-boss com o telefone e o conteúdo
 * cifrados (`IncomingMessageJob`, `OutgoingReplies`), e o pg-boss guarda o job concluído por 7 dias
 * (14 sem processar). O `sairDoLumens` apaga o cadastro, mas não toca nesses jobs — então, sem isto,
 * cópias cifradas das mensagens de quem saiu ficariam até a retenção vencer.
 *
 * Roda na transação da mensagem "sim", depois de a resposta de saída ser enfileirada:
 *
 * - apaga na hora os jobs do telefone nas filas do bot;
 * - menos os que ainda precisam terminar: o job da própria mensagem, o da resposta (sem ele a
 *   pessoa não recebe a confirmação) e algum outro que esteja em andamento. Esses ganham
 *   `deletion_seconds = 1`, e a manutenção do pg-boss os apaga logo depois de concluídos.
 *
 * O job de status de entrega (`StatusDeEnvioJob`) não entra: ele só tem o HMAC do wamid.
 */
import { sql, type Tx } from '@lumens/db';
import { JOBS } from '../queue';

/** As filas cujo `data` tem o `phoneHmac` de quem escreveu. */
export const FILAS_COM_TELEFONE = [
  JOBS.incomingMessage,
  JOBS.incomingMessageDead,
  JOBS.outgoingReplies,
  JOBS.outgoingRepliesDead,
] as const;

/** Segundos depois de concluído. 0 desligaria a remoção no pg-boss, por isso 1. */
const REMOVER_LOGO_APOS_CONCLUIR = 1;

export async function apagarFilasDoTelefone(
  tx: Tx,
  { phoneHmac, manter }: { phoneHmac: string; manter: readonly string[] },
): Promise<void> {
  const filas = sql.join(
    FILAS_COM_TELEFONE.map((fila) => sql`${fila}`),
    sql`, `,
  );
  // Sem nada a manter, a condição some: `id NOT IN (NULL)` daria desconhecido e não apagaria nada.
  const foraOsMantidos =
    manter.length === 0
      ? sql``
      : sql`AND id NOT IN (${sql.join(
          manter.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`;

  await tx.execute(sql`
    DELETE FROM pgboss.job
    WHERE name IN (${filas})
      AND data->>'phoneHmac' = ${phoneHmac}
      AND state <> 'active'
      ${foraOsMantidos}
  `);
  await tx.execute(sql`
    UPDATE pgboss.job
    SET deletion_seconds = ${REMOVER_LOGO_APOS_CONCLUIR}
    WHERE name IN (${filas})
      AND data->>'phoneHmac' = ${phoneHmac}
  `);
}
