import type { Db } from '@lumens/db';
import {
  abrirConferencia,
  enfileirarAvisosDeInatividade,
  enfileirarLembretesDePrazo,
  fecharConferencia,
  promessasParaAbrir,
  promessasParaFechar,
  removerOwnersAvisados,
} from '@lumens/dominio';
import type { PgBoss } from 'pg-boss';
import { resumoDoErro, type Logger } from '../logger';
import { JOBS } from '../queue';

/**
 * Worker dos gatilhos de data da Parte 3 (SCRUM-237): um job só, em vez de cada história com o
 * próprio cron.
 *
 * | Gatilho                                  | História | Função do domínio                 |
 * | ---------------------------------------- | -------- | --------------------------------- |
 * | abertura da conferência na data          | 3.7      | `abrirConferencia`                |
 * | fecho da apuração sete dias depois       | 3.7      | `fecharConferencia`               |
 * | lembrete do prazo do Fala.BR             | 3.8      | `enfileirarLembretesDePrazo`      |
 * | owner inativo (aviso no dia 25, sai no 30) | 3.8    | `enfileirarAvisosDeInatividade`, `removerOwnersAvisados` |
 * | prazo 30+30 vencendo                     | 3.4      | nenhuma: o site calcula de `caminho.prazo` |
 *
 * Cada rodada pergunta ao banco o que está vencido e ainda não foi feito, nunca "o que vence agora".
 * Por isso uma rodada perdida (deploy, queda, máquina desligada) não perde nada: a seguinte faz o
 * que faltou, e rodar duas vezes não faz nada duas vezes (`docs/decisoes/SCRUM-239-janela-perdida.md`).
 */

/** A cada dez minutos: a abertura da conferência atrasa no máximo isso, o resto é por dia. */
export const GATILHOS_CRON = '*/10 * * * *';
export const GATILHOS_TZ = 'America/Maceio';

type Boss = Pick<PgBoss, 'getQueue' | 'createQueue' | 'schedule' | 'work'>;

export interface ResultadoGatilhos {
  conferenciasAbertas: number;
  conferenciasApuradas: number;
  conferenciasReabertas: number;
  lembretesDePrazo: number;
  avisosDeInatividade: number;
  ownersRemovidos: number;
  /** Itens que lançaram erro. Os outros seguem: uma promessa quebrada não trava as demais. */
  falhas: number;
}

/**
 * Uma rodada de todos os gatilhos. Cada promessa roda na própria transação; os lembretes, numa
 * cada. Um erro é registrado e a rodada segue; no fim, se houve erro, a rodada lança para o
 * pg-boss marcar o job como falho — a próxima tenta de novo o que ficou para trás.
 */
export async function rodarGatilhos(
  db: Db,
  logger: Logger,
  agora: Date = new Date(),
): Promise<ResultadoGatilhos> {
  const resultado: ResultadoGatilhos = {
    conferenciasAbertas: 0,
    conferenciasApuradas: 0,
    conferenciasReabertas: 0,
    lembretesDePrazo: 0,
    avisosDeInatividade: 0,
    ownersRemovidos: 0,
    falhas: 0,
  };

  const tentar = async (gatilho: string, passo: () => Promise<void>) => {
    try {
      await passo();
    } catch (erro) {
      resultado.falhas++;
      logger.error({ gatilho, erro: resumoDoErro(erro) }, 'gatilho de data falhou');
    }
  };

  // Abrir antes de fechar: uma conferência que ficou para trás abre (e ganha a semana) antes de
  // alguém tentar apurá-la.
  for (const promessaId of await promessasParaAbrir(db, agora)) {
    await tentar('abrir_conferencia', async () => {
      const r = await db.transaction((tx) => abrirConferencia(tx, { promessaId, agora }));
      if (r.aberta) resultado.conferenciasAbertas++;
    });
  }

  for (const promessaId of await promessasParaFechar(db, agora)) {
    await tentar('fechar_conferencia', async () => {
      const r = await db.transaction((tx) => fecharConferencia(tx, { promessaId, agora }));
      if (r.apurada) resultado.conferenciasApuradas++;
      else if (r.motivo === 'reaberta') resultado.conferenciasReabertas++;
    });
  }

  await tentar('lembrete_prazo', async () => {
    resultado.lembretesDePrazo = await db.transaction((tx) =>
      enfileirarLembretesDePrazo(tx, { agora }),
    );
  });

  // Avisar antes de remover: quem chegou ao dia 30 sem aviso é avisado nesta rodada e só sai
  // depois do prazo do aviso.
  await tentar('aviso_inatividade', async () => {
    resultado.avisosDeInatividade = await db.transaction((tx) =>
      enfileirarAvisosDeInatividade(tx, { agora }),
    );
  });
  await tentar('remover_owner_inativo', async () => {
    resultado.ownersRemovidos = await db.transaction((tx) => removerOwnersAvisados(tx, { agora }));
  });

  logger.info(resultado, 'gatilhos de data');
  if (resultado.falhas > 0) {
    throw new Error(`${String(resultado.falhas)} gatilho(s) de data falharam; veja o log`);
  }
  return resultado;
}

/** Cria a fila e agenda a rodada a cada dez minutos, no fuso de Maceió. */
export async function registerGatilhosJob(
  boss: Boss,
  deps: { db: Db; logger: Logger; agora?: () => Date },
): Promise<void> {
  const name = JOBS.gatilhosDeData;
  if (!(await boss.getQueue(name))) await boss.createQueue(name);
  await boss.schedule(name, GATILHOS_CRON, null, { tz: GATILHOS_TZ });
  await boss.work(name, () => rodarGatilhos(deps.db, deps.logger, deps.agora?.() ?? new Date()));
}
