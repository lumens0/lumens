/**
 * Limite de requisições por IP (SCRUM-310). O back-end fica exposto pelo Caddy, e o pool do
 * Postgres tem 10 conexões para o site e o bot juntos: uma rajada de um IP só esgotava o pool e
 * derrubava os dois. O limite roda no `onRequest`, antes de qualquer consulta ao banco.
 *
 * A contagem fica na memória do processo: a homologação tem um back-end só. Com mais de uma
 * réplica, cada uma contaria à parte, e aí seria a hora de um store compartilhado.
 */
import type { RateLimitPluginOptions } from '@fastify/rate-limit';
import type { FastifyRequest } from 'fastify';

export interface Limite {
  /** Requisições por IP dentro da janela. */
  max: number;
  janelaMs: number;
}

/**
 * API de leitura: folgado para o build e a revalidação do site na Vercel, que leem a API de poucos
 * IPs (a lista, cada pauta, os totais). 600 por minuto é uma pauta a cada 100 ms, o tempo todo.
 */
export const LIMITE_DA_API: Limite = { max: 600, janelaMs: 60_000 };

/**
 * Webhooks: mais alto, porque a Meta e o Telegram mandam rajadas de status quando os avisos saem
 * (um por mensagem enviada, entregue e lida). Recusado com 429, os dois reenviam depois.
 */
export const LIMITE_DOS_WEBHOOKS: Limite = { max: 1200, janelaMs: 60_000 };

export const MUITAS_REQUISICOES = 'Muitas requisições. Tente de novo em instantes.';

/**
 * O IP de quem chamou, sem ligar o `trustProxy`. O Caddy põe no `X-Forwarded-For` o IP do
 * cliente, que fica no fim da lista (o que vem antes, o cliente pode ter escrito). Com o
 * `trustProxy`, o Fastify passaria a registrar esse IP em todo log de requisição, e a contagem só
 * precisa dele na memória. Só é confiável atrás do Caddy: se o back-end for alcançado direto (porta
 * publicada, outro proxy), o cliente escreve o cabeçalho e forja o IP, e com ele a própria contagem.
 * Sem o cabeçalho (rede interna do compose, testes), vale o `req.ip`.
 */
export function ipDoCliente(req: FastifyRequest): string {
  const encaminhado = req.headers['x-forwarded-for'];
  const lista = Array.isArray(encaminhado) ? encaminhado.join(',') : (encaminhado ?? '');
  const ultimo = lista.split(',').at(-1)?.trim();
  return ultimo !== undefined && ultimo !== '' ? ultimo : req.ip;
}

/** As opções do `@fastify/rate-limit` para um escopo de rotas. */
export function opcoesDoLimite({ max, janelaMs }: Limite): RateLimitPluginOptions {
  return {
    global: true,
    max,
    timeWindow: janelaMs,
    keyGenerator: ipDoCliente,
    // Um Error com statusCode: o tratador de erro da API mantém o 429 em vez de virar 500.
    errorResponseBuilder: () => Object.assign(new Error(MUITAS_REQUISICOES), { statusCode: 429 }),
  };
}
