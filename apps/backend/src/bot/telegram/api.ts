/**
 * Cliente mínimo da Bot API do Telegram: um POST com JSON por método.
 *
 * O token do bot faz parte de toda URL (`/bot<token>/<método>` e `/file/bot<token>/<caminho>`).
 * Por isso nenhum erro daqui leva URL nem a mensagem crua do `fetch`: só o método, o código HTTP e
 * a `description` do Telegram, e mesmo assim com o token apagado se aparecer.
 */

export const URL_DA_API = 'https://api.telegram.org';

export class ErroDaApiDoTelegram extends Error {
  constructor(
    readonly metodo: string,
    /** `error_code` do Telegram (o mesmo do HTTP); `undefined` quando nem houve resposta. */
    readonly codigo: number | undefined,
    readonly descricao: string,
    /** Segundos pedidos num 429 (`parameters.retry_after`). */
    readonly esperarSegundos?: number,
  ) {
    super(
      `Telegram ${metodo}: ${codigo === undefined ? 'sem resposta' : String(codigo)} ${descricao}`,
    );
    this.name = 'ErroDaApiDoTelegram';
  }
}

/**
 * O que fazer com uma falha da API:
 * - `permanente`: a pessoa bloqueou o bot, apagou a conta, o chat não existe. Tentar de novo não
 *   muda nada, e o job ficaria no retry até a fila de mortas.
 * - `esperar`: 429; o Telegram diz quantos segundos (`esperarSegundos`).
 * - `passageiro`: rede, 5xx, timeout. Volta pelo retry do pg-boss.
 */
export type ClasseDoErro = 'permanente' | 'esperar' | 'passageiro';

export function classificarErro(erro: unknown): ClasseDoErro {
  if (!(erro instanceof ErroDaApiDoTelegram) || erro.codigo === undefined) return 'passageiro';
  if (erro.codigo === 429) return 'esperar';
  // 403: "bot was blocked by the user", "user is deactivated". 400 "chat not found" é o mesmo caso
  // de quem nunca mais vai receber; outros 400 são bug nosso, e repetir também não resolve. Quem
  // descarta sem deixar rastro (as respostas da conversa) confere antes `destinoPerdido`.
  if (erro.codigo === 403 || erro.codigo === 400) return 'permanente';
  return 'passageiro';
}

/**
 * A recusa é do destino, não da mensagem: 403 (bloqueou o bot, conta apagada) ou 400 "chat not
 * found". Os outros 400 (entidade ou teclado inválido) são defeito nosso: quem descarta só o que
 * passa aqui não esconde um bug.
 */
export function destinoPerdido(erro: unknown): boolean {
  if (!(erro instanceof ErroDaApiDoTelegram)) return false;
  if (erro.codigo === 403) return true;
  return erro.codigo === 400 && /chat not found/i.test(erro.descricao);
}

export interface ApiDoTelegram {
  chamar<T>(metodo: string, parametros?: object, opcoes?: { sinal?: AbortSignal }): Promise<T>;
  /** Bytes de um arquivo (`file_path` do `getFile`). */
  baixarArquivo(caminho: string, opcoes?: { sinal?: AbortSignal }): Promise<Buffer>;
}

export interface OpcoesDaApi {
  token: string;
  /** Trocável nos testes. */
  fetch?: typeof fetch;
  /** Teto de cada chamada. O `getUpdates` soma o próprio long polling a isto. */
  timeoutMs?: number;
}

interface RespostaDaApi {
  ok?: unknown;
  result?: unknown;
  error_code?: unknown;
  description?: unknown;
  parameters?: { retry_after?: unknown };
}

export function criarApiDoTelegram({
  token,
  fetch: buscar = fetch,
  timeoutMs = 10_000,
}: OpcoesDaApi): ApiDoTelegram {
  const semToken = (texto: string) => texto.replaceAll(token, '<token>');

  const sinalCom = (extraMs: number, sinal?: AbortSignal) => {
    const tempo = AbortSignal.timeout(timeoutMs + extraMs);
    return sinal ? AbortSignal.any([tempo, sinal]) : tempo;
  };

  return {
    async chamar<T>(metodo: string, parametros: object = {}, opcoes: { sinal?: AbortSignal } = {}) {
      // O `timeout` do getUpdates é o tempo que o Telegram segura a conexão esperando mensagem.
      const longPolling =
        'timeout' in parametros && typeof parametros.timeout === 'number'
          ? parametros.timeout * 1000
          : 0;
      let resposta: Response;
      let corpo: RespostaDaApi;
      try {
        resposta = await buscar(`${URL_DA_API}/bot${token}/${metodo}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parametros),
          signal: sinalCom(longPolling, opcoes.sinal),
        });
        corpo = (await resposta.json()) as RespostaDaApi;
      } catch (erro) {
        // A mensagem do undici pode trazer a URL; só o nome do erro sai daqui.
        throw new ErroDaApiDoTelegram(
          metodo,
          undefined,
          erro instanceof Error ? erro.name : 'erro',
        );
      }
      if (corpo.ok === true) return corpo.result as T;
      const codigo = typeof corpo.error_code === 'number' ? corpo.error_code : resposta.status;
      const descricao = typeof corpo.description === 'string' ? semToken(corpo.description) : '';
      const esperar = corpo.parameters?.retry_after;
      throw new ErroDaApiDoTelegram(
        metodo,
        codigo,
        descricao,
        typeof esperar === 'number' ? esperar : undefined,
      );
    },

    async baixarArquivo(caminho, opcoes = {}) {
      let resposta: Response;
      try {
        resposta = await buscar(`${URL_DA_API}/file/bot${token}/${caminho}`, {
          signal: sinalCom(0, opcoes.sinal),
        });
        if (!resposta.ok) throw new ErroDaApiDoTelegram('file', resposta.status, '');
        return Buffer.from(await resposta.arrayBuffer());
      } catch (erro) {
        if (erro instanceof ErroDaApiDoTelegram) throw erro;
        throw new ErroDaApiDoTelegram(
          'file',
          undefined,
          erro instanceof Error ? erro.name : 'erro',
        );
      }
    },
  };
}
