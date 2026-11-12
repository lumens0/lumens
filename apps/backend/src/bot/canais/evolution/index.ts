import type { ConfigEvolution } from '../../../config/env';
import type { Chaves } from '../../../cripto/cifra';
import { ErroDeMidia, type MidiaBaixada } from '../../../fotos/meta-midia';
import type { Logger } from '../../../infra/logger';
import { logModeloSender, whatsappAvisoSender, type AvisoSender } from '../../envio/sender';
import { logSender, type ReplySender } from '../../worker';
import { avisosPelaEvolution } from './avisos';
import { criarCliente } from './cliente';
import { baixarMidiaDaEvolution } from './midia';
import { respostasPelaEvolution } from './respostas';

/** Avisos só para quem escreveu ao bot nas últimas 24h (SCRUM-275). */
export const JANELA_DE_CONTATO_MS = 24 * 60 * 60 * 1000;

/** O que o `main.ts` liga quando o WhatsApp sai pela Evolution. */
export interface CanalEvolution {
  respostas: ReplySender;
  avisos: AvisoSender;
  /** Baixa a mídia pela referência que o webhook pôs no job (`image.id`, `document.id`). */
  baixarMidia(referencia: string, opcoes?: { tamanhoMaximo?: number }): Promise<MidiaBaixada>;
  /** Ritmo dos avisos (fila de disparos). */
  envio: { limite: number; maximoPorLote: number; somenteQuemEscreveuNosUltimosMs: number };
}

/**
 * Monta o WhatsApp pela Evolution API (`CANAL_BOT=whatsapp` e `CANAL_WHATSAPP=evolution`).
 *
 * No `pnpm dev` sem `EVOLUTION_URL`, o webhook funciona (para o `pnpm sim --canal evolution`) e as
 * respostas e os avisos só vão para o log, como no WhatsApp da Meta. Fora do dev, sem a URL o
 * servidor não sobe: ele receberia mensagens sem ter como responder.
 */
export function criarCanalEvolution(opcoes: {
  config: ConfigEvolution;
  logger: Logger;
  chaves: Chaves;
  modoDev: boolean;
  fetch?: typeof fetch;
}): CanalEvolution {
  const { config, logger, chaves, modoDev } = opcoes;
  const envio = {
    limite: config.limitePessoas,
    maximoPorLote: config.avisosPorLote,
    somenteQuemEscreveuNosUltimosMs: JANELA_DE_CONTATO_MS,
  };

  if (config.url === undefined || config.apiKey === undefined) {
    if (!modoDev) {
      throw new Error(
        'CANAL_WHATSAPP=evolution precisa de EVOLUTION_URL e EVOLUTION_API_KEY fora do dev.',
      );
    }
    return {
      envio,
      respostas: logSender(logger, chaves, { mostrarTexto: true }),
      avisos: whatsappAvisoSender(logModeloSender(logger)),
      baixarMidia: () =>
        Promise.reject(new ErroDeMidia('indisponivel', 'Sem EVOLUTION_URL no dev.')),
    };
  }

  const chamar = criarCliente({
    url: config.url,
    apiKey: config.apiKey,
    instancia: config.instancia,
    ...(opcoes.fetch ? { fetch: opcoes.fetch } : {}),
  });
  return {
    envio,
    respostas: respostasPelaEvolution(chamar, chaves),
    avisos: avisosPelaEvolution(chamar, {
      intervaloMinMs: config.intervaloMinMs,
      intervaloMaxMs: config.intervaloMaxMs,
    }),
    baixarMidia: (referencia, opcoesDaMidia) =>
      baixarMidiaDaEvolution(referencia, chamar, opcoesDaMidia),
  };
}
