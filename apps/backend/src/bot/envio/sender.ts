import { randomUUID } from 'node:crypto';
import type { Logger } from '../../infra/logger';
import type { AvisoRenderizado } from './aviso';
import { mensagemModeloDe, type MensagemModelo } from './mensagem-modelo';

/**
 * Quem entrega um aviso da fila num canal. O worker de envio escolhe um por disparo, pelo canal
 * que a reserva decidiu (`disparo.canal`).
 */
export interface AvisoSender {
  /**
   * Entrega o aviso em `destino` (o telefone ou o chat id, já decifrado). Devolve o id que o canal
   * deu à mensagem e se o sucesso do envio já vale como entrega (o canal não tem recibo depois).
   * Lança `ErroDeEnvio` para o worker saber se tira o disparo da fila ou para o canal.
   */
  enviar(aviso: AvisoRenderizado, destino: string): Promise<{ id: string; entregue: boolean }>;
}

/**
 * Falha ao enviar um aviso, de qualquer canal.
 * - `permanente`: tentar de novo não muda nada para ESTE destinatário; o disparo sai da fila com o
 *   `motivo`.
 * - `pararLote`: vale para o canal inteiro (limite de taxa, token, rede); o resto do lote naquele
 *   canal espera a próxima rodada.
 * - nenhum dos dois: passageiro, só este disparo espera.
 * - `destinoPerdido`: o destino não serve mais para canal nenhum deste estudante (a pessoa
 *   bloqueou o bot no Telegram). O worker esquece o destino, e os próximos avisos vão por outro
 *   canal.
 */
export class ErroDeEnvio extends Error {
  constructor(
    mensagem: string,
    readonly motivo: string,
    readonly permanente: boolean,
    readonly pararLote: boolean,
    readonly destinoPerdido = false,
  ) {
    super(mensagem);
    this.name = 'ErroDeEnvio';
  }
}

/** Quem entrega a mensagem modelo. Devolve o wamid que a Meta atribuiu ao envio. */
export interface ModeloSender {
  enviar(mensagem: MensagemModelo): Promise<{ wamid: string }>;
}

/**
 * O WhatsApp como `AvisoSender`: o aviso vira o corpo da Cloud API de sempre. A entrega chega
 * depois, pelo webhook de status da Meta.
 */
export function whatsappAvisoSender(sender: ModeloSender): AvisoSender {
  return {
    enviar: async (aviso, telefone) => {
      const { wamid } = await sender.enviar(mensagemModeloDe(aviso, telefone));
      return { id: wamid, entregue: false };
    },
  };
}

/**
 * Erros da Meta que não mudam tentando de novo para ESTE destinatário: número sem WhatsApp, fora
 * da lista de teste, mensagem que não casa com o modelo. O disparo sai da fila com o motivo.
 */
const PERMANENTES = new Set([
  100, // parâmetro inválido
  131026, // mensagem não entregável (número sem WhatsApp, versão antiga, termos não aceitos)
  131030, // número fora da lista permitida do número de teste
  131050, // a pessoa parou de receber mensagens desta empresa
  132000, // quantidade de parâmetros não bate com o modelo
  132005, // texto do modelo ficou longo demais com os parâmetros
  132007, // parâmetro viola a política de formatação do modelo
  132012, // formato de parâmetro não bate com o modelo
  132016, // modelo desativado de vez
]);

/**
 * Erros que valem para todo o lote, não só para este destinatário: limite de taxa, token
 * inválido, conta bloqueada, Meta fora do ar. Continuar o lote só gastaria chamadas.
 */
const PARAM_O_LOTE = new Set([
  4, // limite de chamadas do app
  190, // token expirado ou inválido
  368, // conta temporariamente bloqueada por política
  130429, // limite de vazão
  131005, // acesso negado
  131016, // serviço indisponível
  131031, // conta bloqueada
  131048, // limite por spam
]);

/**
 * Erro devolvido pela Cloud API. O que não está em nenhuma lista é passageiro: o disparo fica na
 * fila, a reserva vence e ele volta no próximo lote. É o caso do modelo ainda não aprovado
 * (132001) e do modelo pausado (132015), que se resolvem sozinhos.
 */
export class ErroDaMeta extends ErroDeEnvio {
  constructor(
    readonly codigo: number | null,
    mensagem: string,
  ) {
    super(
      `Meta ${codigo === null ? 'sem código' : String(codigo)}: ${mensagem}`,
      `meta:${String(codigo)}`,
      codigo !== null && PERMANENTES.has(codigo),
      // Sem código é falha de rede ou resposta estranha: a próxima chamada provavelmente falha igual.
      codigo === null || PARAM_O_LOTE.has(codigo),
    );
    this.name = 'ErroDaMeta';
  }
}

/** Versão da Graph API, a mesma do script de submissão dos modelos. */
export const VERSAO_GRAPH = 'v23.0';

/** Envio pela Cloud API da Meta. */
export function graphSender(opcoes: {
  token: string;
  phoneNumberId: string;
  versao?: string;
  fetch?: typeof fetch;
}): ModeloSender {
  const url = `https://graph.facebook.com/${opcoes.versao ?? VERSAO_GRAPH}/${opcoes.phoneNumberId}/messages`;
  const chamar = opcoes.fetch ?? fetch;

  return {
    enviar: async (mensagem) => {
      let resposta: Response;
      try {
        resposta = await chamar(url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${opcoes.token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(mensagem),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (erro) {
        throw new ErroDaMeta(null, erro instanceof Error ? erro.message : String(erro));
      }

      const corpo = (await resposta.json().catch(() => ({}))) as {
        messages?: { id?: string }[];
        error?: { code?: number; message?: string };
      };
      const wamid = corpo.messages?.[0]?.id;
      if (resposta.ok && wamid !== undefined) return { wamid };

      // A mensagem de erro da Meta não traz o telefone; o corpo da requisição, que traz, não vai.
      throw new ErroDaMeta(
        corpo.error?.code ?? null,
        corpo.error?.message ?? `HTTP ${String(resposta.status)}`,
      );
    },
  };
}

/**
 * Envio de mentira para o `pnpm dev`: registra o modelo e devolve um wamid inventado, para a fila
 * andar sem token da Meta. Não registra o telefone nem os parâmetros.
 */
export function logModeloSender(logger: Logger): ModeloSender {
  return {
    enviar: (mensagem) => {
      logger.info(
        { modelo: mensagem.template.name },
        'mensagem modelo (envio pela Meta desligado no dev)',
      );
      return Promise.resolve({ wamid: `dev.${randomUUID()}` });
    },
  };
}
