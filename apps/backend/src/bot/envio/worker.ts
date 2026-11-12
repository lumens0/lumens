import type { Db } from '@lumens/db';
import {
  type CanalDoBot,
  registrarEntrega,
  registrarEnvio,
  registrarFalha,
  registrarFalhaDeEntrega,
  renovarReserva,
  reservarLote,
} from '@lumens/dominio';
import type { Job, PgBoss } from 'pg-boss';
import { decifrar, hmacHex, type Chaves } from '../../cripto/cifra';
import { resumoDoErro, type Logger } from '../../infra/logger';
import { JOBS } from '../../infra/queue';
import { renderizarAviso, ParametrosInvalidosError, type AvisoRenderizado } from './aviso';
import { ErroDeEnvio, type AvisoSender } from './sender';

/**
 * Envio em lotes da fila de disparos (SCRUM-208) e registro de entrega por pessoa (SCRUM-209).
 *
 * A cada minuto o worker reserva o lote que cabe no limite do canal (`reservarLote`, RNF06), manda
 * cada aviso pelo sender do canal ativo (`CANAL_BOT`: um só por processo) e registra o que
 * aconteceu. Quem decide quem sai e quem espera é a fila; aqui só se executa o plano. O destino é o
 * endereço do estudante no canal ativo (`telefone_cifrado`): o telefone no WhatsApp, o chat id no
 * Telegram.
 *
 * O registro de entrega por canal:
 *
 *   | campo         | WhatsApp                               | Telegram                           |
 *   | ------------- | -------------------------------------- | ---------------------------------- |
 *   | `enviado_em`  | a Meta aceitou o envio                 | o `sendMessage` deu certo          |
 *   | `entregue_em` | webhook `delivered`/`read`             | o mesmo instante do `enviado_em`   |
 *   | `falhou_em`   | recusa permanente, ou webhook `failed` | recusa permanente (403, 400)       |
 *
 * O Telegram não tem recibo de entrega nem de leitura, nem webhook de status: o `sendMessage` que
 * devolve a mensagem já a gravou no chat da pessoa, e é o único sinal que existe. Por isso ele vale
 * como entrega. As regras que dependem desses campos continuam iguais nos dois canais: "avisado" é
 * `enviado_em` ou `falhou_em` (SCRUM-239, remoção do owner inativo), e quem bloqueou o bot (403)
 * sai da fila com `falhou_em`, como o número sem WhatsApp.
 */

/** A cada minuto: um aviso espera no máximo isso para sair, se houver cota. */
export const ENVIO_CRON = '* * * * *';

type Boss = Pick<PgBoss, 'getQueue' | 'createQueue' | 'schedule' | 'work'>;

export interface EnvioDeps {
  db: Db;
  /** Quem envia no canal ativo. */
  sender: AvisoSender;
  /**
   * O canal ativo: só os estudantes com endereço dele entram no lote. Depois de uma troca de canal,
   * o aviso de quem ainda não se verificou no novo fica pendente. O padrão é o WhatsApp.
   */
  canal?: CanalDoBot;
  chaves: Chaves;
  logger: Logger;
  /**
   * Pessoas distintas por 24h que o canal permite (RNF06). No WhatsApp é o limite da Meta; no
   * Telegram não há cota, e o ritmo fica com o sender.
   */
  limite: number;
  /** Teto de disparos por lote (um lote por minuto), para o ritmo baixo da Evolution (SCRUM-275). */
  maximoPorLote?: number;
  /**
   * Só manda para quem escreveu ao bot nesse intervalo, em ms (SCRUM-275). Os outros esperam na
   * fila até escreverem ou o aviso expirar. A Meta não usa: a mensagem modelo é o que permite
   * escrever primeiro.
   */
  somenteQuemEscreveuNosUltimosMs?: number;
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
  const lote = await db.transaction((tx) =>
    reservarLote(tx, {
      limite: deps.limite,
      agora,
      ...(deps.canal ? { canal: deps.canal } : {}),
      ...(deps.maximoPorLote === undefined ? {} : { maximo: deps.maximoPorLote }),
      ...(deps.somenteQuemEscreveuNosUltimosMs === undefined
        ? {}
        : {
            somenteComConversaDesde: new Date(
              agora.getTime() - deps.somenteQuemEscreveuNosUltimosMs,
            ),
          }),
    }),
  );
  const resultado: ResultadoDoLote = { enviados: 0, falhas: 0, adiados: 0, tomadosPorOutro: 0 };

  const falhar = async (id: string, motivo: string) => {
    await db.transaction((tx) => registrarFalha(tx, { id, motivo }));
    resultado.falhas++;
    logger.warn({ disparo: id, motivo }, 'disparo saiu da fila sem envio');
  };

  for (const [posicao, disparo] of lote.entries()) {
    let aviso: AvisoRenderizado;
    let destino: string;
    try {
      aviso = renderizarAviso(disparo);
      destino = decifrar(disparo.telefoneCifrado, chaves.cifra);
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
      const { id, entregue } = await sender.enviar(aviso, destino);
      // O wamid em claro codifica o telefone (e o id do Telegram, o chat): só o HMAC vai para o
      // banco, como no webhook.
      const wamidHmac = hmacHex(id, chaves.hmac);
      if (entregue) {
        // Telegram: sem recibo depois, o envio que deu certo é a entrega (veja o topo do arquivo).
        const instante = relogio();
        await db.transaction(async (tx) => {
          await registrarEnvio(tx, { id: disparo.id, wamidHmac, agora: instante });
          await registrarEntrega(tx, { wamidHmac, agora: instante });
        });
      } else {
        await db.transaction((tx) => registrarEnvio(tx, { id: disparo.id, wamidHmac }));
      }
      resultado.enviados++;
    } catch (erro) {
      if (erro instanceof ErroDeEnvio && erro.permanente) {
        await falhar(disparo.id, erro.motivo);
        continue;
      }
      logger.warn({ disparo: disparo.id, erro: resumoDoErro(erro) }, 'envio adiado');
      if (!(erro instanceof ErroDeEnvio) || erro.pararLote) {
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
