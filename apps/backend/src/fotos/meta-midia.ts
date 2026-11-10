/**
 * Baixa a foto que a pessoa mandou pelo WhatsApp (2.6).
 *
 * A mensagem só traz o id da mídia. São duas chamadas à Graph API, as duas com o token do app:
 *
 *   1. GET /{media-id}      → { url, mime_type, file_size }: a URL vale só 5 minutos;
 *   2. GET {url}            → os bytes da imagem.
 *
 * O tamanho é conferido antes de baixar (pelo `file_size`) e de novo depois (pelos bytes), para
 * não guardar na memória um arquivo maior que o limite.
 */

import { passaDoTamanhoMaximo } from './imagem';

/** Versão da Graph API; a mesma do script das mensagens modelo (`scripts/modelos.ts`). */
export const VERSAO_GRAPH = 'v23.0';

export class ErroDeMidia extends Error {
  constructor(
    readonly motivo: 'tamanho' | 'indisponivel',
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroDeMidia';
  }
}

export interface MidiaBaixada {
  bytes: Buffer;
  /** O tipo que a Meta informa, ex.: `image/jpeg`. */
  mimeType: string;
}

export interface OpcoesDeDownload {
  token: string;
  /** Trocável nos testes. */
  fetch?: typeof fetch;
  /** Cada chamada desiste depois disso, para não segurar a conversa. */
  timeoutMs?: number;
}

const lerInformacoes = (dados: unknown): { url: string; mimeType: string; tamanho: number } => {
  if (typeof dados !== 'object' || dados === null) throw new Error('resposta sem objeto');
  const { url, mime_type: mimeType, file_size: tamanho } = dados as Record<string, unknown>;
  if (typeof url !== 'string' || typeof mimeType !== 'string') throw new Error('resposta sem url');
  return { url, mimeType, tamanho: typeof tamanho === 'number' ? tamanho : 0 };
};

export async function baixarMidiaDaMeta(
  mediaId: string,
  { token, fetch: buscar = fetch, timeoutMs = 10_000 }: OpcoesDeDownload,
): Promise<MidiaBaixada> {
  const cabecalhos = { Authorization: `Bearer ${token}` };

  let informacoes: { url: string; mimeType: string; tamanho: number };
  try {
    const resposta = await buscar(
      `https://graph.facebook.com/${VERSAO_GRAPH}/${encodeURIComponent(mediaId)}`,
      { headers: cabecalhos, signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!resposta.ok) throw new Error(`HTTP ${String(resposta.status)}`);
    informacoes = lerInformacoes(await resposta.json());
  } catch (erro) {
    // A mensagem do erro não leva o token nem a URL assinada.
    throw new ErroDeMidia('indisponivel', `Falha ao consultar a mídia: ${nomeDoErro(erro)}`);
  }

  if (passaDoTamanhoMaximo(informacoes.tamanho)) {
    throw new ErroDeMidia('tamanho', 'A foto passa do limite de tamanho.');
  }

  let bytes: Buffer;
  try {
    const resposta = await buscar(informacoes.url, {
      headers: cabecalhos,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resposta.ok) throw new Error(`HTTP ${String(resposta.status)}`);
    bytes = Buffer.from(await resposta.arrayBuffer());
  } catch (erro) {
    throw new ErroDeMidia('indisponivel', `Falha ao baixar a mídia: ${nomeDoErro(erro)}`);
  }

  if (passaDoTamanhoMaximo(bytes.length)) {
    throw new ErroDeMidia('tamanho', 'A foto passa do limite de tamanho.');
  }
  return { bytes, mimeType: informacoes.mimeType };
}

function nomeDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : 'erro desconhecido';
}
