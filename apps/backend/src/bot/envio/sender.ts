import { randomUUID } from 'node:crypto';
import type { Logger } from '../../logger';
import type { MensagemModelo } from './mensagem-modelo';

/** Quem entrega a mensagem modelo. Devolve o wamid que a Meta atribuiu ao envio. */
export interface ModeloSender {
  enviar(mensagem: MensagemModelo): Promise<{ wamid: string }>;
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
export class ErroDaMeta extends Error {
  readonly permanente: boolean;
  readonly pararLote: boolean;

  constructor(
    readonly codigo: number | null,
    mensagem: string,
  ) {
    super(`Meta ${codigo === null ? 'sem código' : String(codigo)}: ${mensagem}`);
    this.name = 'ErroDaMeta';
    this.permanente = codigo !== null && PERMANENTES.has(codigo);
    // Sem código é falha de rede ou resposta estranha: a próxima chamada provavelmente falha igual.
    this.pararLote = codigo === null || PARAM_O_LOTE.has(codigo);
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
