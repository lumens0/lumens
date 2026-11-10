import type { Db } from '@lumens/db';
import {
  registrarEntrega,
  registrarEnvio,
  registrarFalha,
  registrarFalhaDeEntrega,
  renovarReserva,
  reservarLote,
} from '@lumens/dominio';
import type { Job, PgBoss } from 'pg-boss';
import { decifrar, hmacHex, type Chaves } from '../../cripto';
import { resumoDoErro, type Logger } from '../../logger';
import { JOBS } from '../../queue';
import { montarMensagemModelo, ParametrosInvalidosError } from './mensagem-modelo';
import { ErroDaMeta, type ModeloSender } from './sender';

/**
 * Envio em lotes da fila de disparos (SCRUM-208) e registro de entrega por pessoa (SCRUM-209).
 *
 * A cada minuto o worker reserva o lote que cabe no limite da Meta (`reservarLote`, RNF06), manda
 * cada mensagem modelo e registra o que aconteceu. Quem decide quem sai e quem espera é a fila;
 * aqui só se executa o plano.
 */

/** A cada minuto: um aviso espera no máximo isso para sair, se houver cota. */
export const ENVIO_CRON = '* * * * *';

type Boss = Pick<PgBoss, 'getQueue' | 'createQueue' | 'schedule' | 'work'>;

export interface EnvioDeps {
  db: Db;
  sender: ModeloSender;
  chaves: Chaves;
  logger: Logger;
  /** Pessoas distintas por 24h que a Meta permite hoje (RNF06). */
  limite: number;
  /** Relógio de cada envio. Injetável para teste; o padrão é a hora de agora. */
  relogio?: () => Date;
}

export interface ResultadoDoLote {
  enviados: number;
  /** Saíram da fila de vez, com o motivo gravado. */
  falhas: number;
  /** Ficam para o próximo lote: a reserva vence e eles voltam. */
  adiados: number;
  /** A reserva venceu no meio do lote e outra instância pegou: não manda, para não duplicar. */
  tomadosPorOutro: number;
}

/**
 * Um lote: reserva, envia um por um, registra. Antes de cada envio, renova a reserva daquele
 * disparo (`renovarReserva`): se outra instância já o pegou, pula. É o que impede a mesma
 * mensagem de sair duas vezes quando o lote leva mais que os dez minutos da reserva.
 */
export async function enviarLote(
  deps: EnvioDeps,
  agora: Date = new Date(),
): Promise<ResultadoDoLote> {
  const { db, sender, chaves, logger } = deps;
  const relogio = deps.relogio ?? (() => new Date());
  const lote = await db.transaction((tx) => reservarLote(tx, { limite: deps.limite, agora }));
  const resultado: ResultadoDoLote = { enviados: 0, falhas: 0, adiados: 0, tomadosPorOutro: 0 };

  const falhar = async (id: string, motivo: string) => {
    await db.transaction((tx) => registrarFalha(tx, { id, motivo }));
    resultado.falhas++;
    logger.warn({ disparo: id, motivo }, 'disparo saiu da fila sem envio');
  };

  for (const [posicao, disparo] of lote.entries()) {
    let mensagem;
    try {
      mensagem = montarMensagemModelo(disparo, decifrar(disparo.telefoneCifrado, chaves.cifra));
    } catch (erro) {
      await falhar(
        disparo.id,
        erro instanceof ParametrosInvalidosError ? 'parametros_invalidos' : 'telefone_ilegivel',
      );
      continue;
    }

    const posse = await db.transaction((tx) =>
      renovarReserva(tx, { id: disparo.id, reservadoEm: disparo.reservadoEm, agora: relogio() }),
    );
    if (posse === null) {
      resultado.tomadosPorOutro++;
      logger.info({ disparo: disparo.id }, 'reserva vencida e tomada por outra instância; pulando');
      continue;
    }

    try {
      const { wamid } = await sender.enviar(mensagem);
      // O wamid em claro codifica o telefone: só o HMAC vai para o banco, como no webhook.
      const wamidHmac = hmacHex(wamid, chaves.hmac);
      await db.transaction((tx) => registrarEnvio(tx, { id: disparo.id, wamidHmac }));
      resultado.enviados++;
    } catch (erro) {
      if (erro instanceof ErroDaMeta && erro.permanente) {
        await falhar(disparo.id, `meta:${String(erro.codigo)}`);
        continue;
      }
      logger.warn({ disparo: disparo.id, erro: resumoDoErro(erro) }, 'envio adiado');
      if (!(erro instanceof ErroDaMeta) || erro.pararLote) {
        // O resto do lote também volta quando a reserva vencer.
        resultado.adiados += lote.length - posicao;
        break;
      }
      resultado.adiados++;
    }
  }

  if (lote.length > 0) logger.info(resultado, 'lote de disparos');
  return resultado;
}

export async function registerEnvioWorker(boss: Boss, deps: EnvioDeps): Promise<void> {
  const name = JOBS.envioDisparos;
  if (!(await boss.getQueue(name))) await boss.createQueue(name);
  await boss.schedule(name, ENVIO_CRON);
  await boss.work(name, () => enviarLote(deps));
}

/** Status de entrega que o webhook repassa (sem o telefone, que vem em `recipient_id`). */
export interface StatusDeEnvioJob {
  wamidHmac: string;
  status: 'delivered' | 'read' | 'failed';
  /** Segundos desde a época, como a Meta manda. */
  timestamp: string;
  codigoErro?: number;
}

/**
 * O status pode chegar antes de `registrarEnvio` confirmar, e então não acha o disparo. Uma nova
 * tentativa 30 s depois cobre essa corrida. Status de wamid que não é de disparo (as respostas da
 * conversa) também não acha nada; por isso é uma tentativa só, e não insistência.
 */
export const STATUS_QUEUE_OPTIONS = { retryLimit: 1, retryDelay: 30 } as const;

export class DisparoNaoEncontradoError extends Error {
  constructor() {
    super('Status de um wamid sem disparo registrado (ainda).');
    this.name = 'DisparoNaoEncontradoError';
  }
}

export async function registrarStatusDeEnvio(
  db: Db,
  { wamidHmac, status, timestamp, codigoErro }: StatusDeEnvioJob,
): Promise<boolean> {
  const quando = new Date(Number(timestamp) * 1000);
  const agora = Number.isNaN(quando.getTime()) ? new Date() : quando;
  return db.transaction((tx) =>
    status === 'failed'
      ? registrarFalhaDeEntrega(tx, {
          wamidHmac,
          motivo: `meta:${codigoErro === undefined ? 'falha_de_entrega' : String(codigoErro)}`,
          agora,
        })
      : registrarEntrega(tx, { wamidHmac, agora }),
  );
}

export async function registerStatusWorker(
  boss: Boss,
  deps: { db: Db; logger: Logger },
): Promise<void> {
  const name = JOBS.statusDeEnvio;
  if (!(await boss.getQueue(name))) await boss.createQueue(name, STATUS_QUEUE_OPTIONS);
  await boss.work<StatusDeEnvioJob>(name, async (jobs: Job<StatusDeEnvioJob>[]) => {
    for (const job of jobs) {
      if (await registrarStatusDeEnvio(deps.db, job.data)) continue;
      // Na última tentativa, desiste em silêncio: é status de mensagem que não é disparo.
      if (job.retryCount >= STATUS_QUEUE_OPTIONS.retryLimit) continue;
      throw new DisparoNaoEncontradoError();
    }
  });
}
