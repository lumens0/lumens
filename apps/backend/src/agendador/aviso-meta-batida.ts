import type { Db } from '@lumens/db';
import { enfileirarAvisoMetaBatida, pautasComMetaBatidaSemAviso } from '@lumens/dominio';
import type { PgBoss } from 'pg-boss';
import { resumoDoErro, type Logger } from '../infra/logger';
import { JOBS } from '../infra/queue';

/**
 * Gatilho da meta batida (3.2, SCRUM-207). A cada minuto, procura pauta que bateu a meta e ainda
 * não tem aviso na fila, e chama o domínio para enfileirar. Pergunta pelo estado, não pelo
 * instante: se o job ficar parado, a rodada seguinte avisa o que ficou para trás (até sete dias).
 */
export const AVISO_META_BATIDA_CRON = '* * * * *';

type Boss = Pick<PgBoss, 'getQueue' | 'createQueue' | 'schedule' | 'work'>;

/** Uma rodada. Cada pauta na própria transação: uma com erro não segura as outras. */
export async function avisarMetasBatidas(
  db: Db,
  logger: Logger,
  agora: Date = new Date(),
): Promise<{ pautas: number; avisos: number; falhas: number }> {
  const resultado = { pautas: 0, avisos: 0, falhas: 0 };
  for (const pautaId of await pautasComMetaBatidaSemAviso(db, agora)) {
    try {
      resultado.avisos += await db.transaction((tx) =>
        enfileirarAvisoMetaBatida(tx, { pautaId, agora }),
      );
      resultado.pautas++;
    } catch (erro) {
      resultado.falhas++;
      logger.error({ pauta: pautaId, erro: resumoDoErro(erro) }, 'aviso de meta batida falhou');
    }
  }
  if (resultado.pautas > 0 || resultado.falhas > 0) logger.info(resultado, 'avisos de meta batida');
  if (resultado.falhas > 0) {
    throw new Error(`${String(resultado.falhas)} aviso(s) de meta batida falharam; veja o log`);
  }
  return resultado;
}

export async function registerAvisoMetaBatidaJob(
  boss: Boss,
  deps: { db: Db; logger: Logger },
): Promise<void> {
  const name = JOBS.avisoMetaBatida;
  if (!(await boss.getQueue(name))) await boss.createQueue(name);
  await boss.schedule(name, AVISO_META_BATIDA_CRON);
  await boss.work(name, () => avisarMetasBatidas(deps.db, deps.logger));
}
