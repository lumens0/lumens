import { ErroDeEnvio } from '../../envio/sender';

/**
 * Cliente HTTP da Evolution API (v2.3.7), só com o que o Lumens usa. Fala com o contêiner pela
 * rede interna do compose; a Evolution não tem porta pública (veja docs/operacao/evolution.md).
 */
export interface OpcoesDoCliente {
  /** Ex.: `http://evolution:8080`. */
  url: string;
  apiKey: string;
  instancia: string;
  /** Trocável nos testes. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export type ClienteEvolution = (caminho: string, corpo: unknown) => Promise<unknown>;

/**
 * Erro de uma chamada à Evolution, classificado como o `ErroDaMeta`.
 *
 * A mensagem nunca leva o corpo da resposta: a Evolution devolve o número do destinatário nele
 * (`response.message[].number`), e o erro vai para o log e para o motivo do disparo.
 */
export class ErroDaEvolution extends ErroDeEnvio {
  constructor(
    /** Status HTTP, `numero_inexistente`, `desconectada` ou `null` para falha de rede. */
    readonly codigo: number | 'numero_inexistente' | 'desconectada' | null,
    mensagem: string,
  ) {
    // Número sem WhatsApp e pedido recusado (400, 422) se repetem para este destinatário. O resto é
    // da instância: chave errada (401/403), instância sumida (404), desconectada ou fora do ar
    // (5xx, rede). Continuar o lote só acumularia falhas no mesmo número.
    const permanente = codigo === 'numero_inexistente' || codigo === 400 || codigo === 422;
    super(
      `Evolution ${codigo === null ? 'sem resposta' : String(codigo)}: ${mensagem}`,
      `evolution:${codigo === null ? 'sem_resposta' : String(codigo)}`,
      permanente,
      !permanente,
    );
    this.name = 'ErroDaEvolution';
  }
}

/** Uma resposta 400 da Evolution que diz que o número não tem WhatsApp. */
function numeroInexistente(corpo: unknown): boolean {
  const mensagens = (corpo as { response?: { message?: unknown } } | null)?.response?.message;
  return (
    Array.isArray(mensagens) &&
    mensagens.some((m) => (m as { exists?: unknown } | null)?.exists === false)
  );
}

/** Só classifica: o texto da resposta não sai daqui. */
function desconectada(corpo: unknown): boolean {
  return /connection closed|not connected|instance does not exist|disconnected/i.test(
    JSON.stringify(corpo ?? ''),
  );
}

export function criarCliente(opcoes: OpcoesDoCliente): ClienteEvolution {
  const buscar = opcoes.fetch ?? fetch;
  const base = opcoes.url.replace(/\/+$/, '');
  const timeoutMs = opcoes.timeoutMs ?? 30_000;

  return async (caminho, corpo) => {
    let resposta: Response;
    try {
      resposta = await buscar(`${base}${caminho}/${encodeURIComponent(opcoes.instancia)}`, {
        method: 'POST',
        headers: { apikey: opcoes.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (erro) {
      throw new ErroDaEvolution(null, erro instanceof Error ? erro.name : 'falha de rede');
    }
    const dados: unknown = await resposta.json().catch(() => null);
    if (resposta.ok) return dados;
    // A sessão caída também volta como 400 em algumas rotas; ela não é culpa do destinatário.
    if (desconectada(dados)) {
      throw new ErroDaEvolution('desconectada', 'a instância não está conectada ao WhatsApp');
    }
    if (resposta.status === 400 && numeroInexistente(dados)) {
      throw new ErroDaEvolution('numero_inexistente', 'o número não tem WhatsApp');
    }
    throw new ErroDaEvolution(resposta.status, `HTTP ${String(resposta.status)} em ${caminho}`);
  };
}
