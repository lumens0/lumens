/**
 * Limite de mensagens por pessoa (proteção contra spam no bot).
 *
 * O limite por IP (`limite.ts`) não serve aqui: a Meta, a Evolution e o Telegram mandam todas as
 * mensagens do mesmo IP, então uma pessoa só encheria a fila do bot sem nunca bater nele. Aqui a
 * chave é o HMAC do telefone (ou do chat), que já vem no job, e a conta roda antes de gravar o
 * dedup e de enfileirar: mensagem recusada não gasta conexão do banco nem vaga na fila.
 *
 * Janela deslizante, com as mensagens recusadas contando também: quem continua mandando continua
 * bloqueado, e só volta depois de ficar uma janela inteira em silêncio. Quem escreve num ritmo
 * humano (20 mensagens por minuto são uma a cada 3 segundos) nunca percebe.
 *
 * A contagem fica na memória do processo, como a do `limite.ts`: com mais de uma réplica, cada
 * uma contaria à parte.
 */

export interface LimiteDeMensagens {
  /** Mensagens aceitas dentro da janela. */
  max: number;
  janelaMs: number;
}

export const LIMITE_DE_MENSAGENS: LimiteDeMensagens = { max: 20, janelaMs: 60_000 };

/** Acima disto, as pessoas mais antigas sem mensagem na janela saem do mapa (memória limitada). */
const MAX_CHAVES = 10_000;

export interface ResultadoDoLimite {
  permitida: boolean;
  /** Só na primeira recusa da janela: quem chama registra um aviso, sem repetir a cada mensagem. */
  primeiraRecusa: boolean;
}

export interface LimitadorPorTelefone {
  /** Conta a mensagem de `chave` e diz se ela passa. */
  registrar(chave: string): ResultadoDoLimite;
  /** Esquece todas as contagens (os testes compartilham o limitador do processo). */
  limpar(): void;
  /** Quantos instantes estão guardados para a chave (para os testes de memória). */
  retidos(chave: string): number;
}

export function criarLimitadorPorTelefone(
  { max, janelaMs }: LimiteDeMensagens = LIMITE_DE_MENSAGENS,
  agora: () => number = Date.now,
): LimitadorPorTelefone {
  /**
   * Por pessoa: só as últimas `max + 1` tentativas (aceitas ou não) e se a pessoa já estava
   * bloqueada. Tem mais de `max` tentativas na janela exatamente quando a `max + 1`-ésima mais
   * recente ainda cabe nela, então o resto nunca precisa ser guardado: o custo de cada mensagem é
   * fixo, mesmo no meio de uma enxurrada, e a memória por pessoa é limitada.
   */
  interface Estado {
    ultimas: number[];
    bloqueada: boolean;
  }
  const estados = new Map<string, Estado>();

  const limpar = (t: number) => {
    for (const [chave, estado] of estados) {
      if ((estado.ultimas.at(-1) ?? 0) <= t - janelaMs) estados.delete(chave);
    }
  };

  return {
    limpar: () => {
      estados.clear();
    },
    retidos: (chave) => estados.get(chave)?.ultimas.length ?? 0,
    registrar(chave) {
      const t = agora();
      if (estados.size >= MAX_CHAVES) limpar(t);
      const estado = estados.get(chave) ?? { ultimas: [], bloqueada: false };
      estado.ultimas.push(t);
      if (estado.ultimas.length > max + 1) estado.ultimas.shift();
      const permitida = !(
        estado.ultimas.length === max + 1 && (estado.ultimas[0] ?? 0) > t - janelaMs
      );
      const primeiraRecusa = !permitida && !estado.bloqueada;
      estado.bloqueada = !permitida;
      estados.set(chave, estado);
      return { permitida, primeiraRecusa };
    },
  };
}

/** O limitador do processo, o mesmo para os três canais. */
export const limitadorDoBot: LimitadorPorTelefone = criarLimitadorPorTelefone();
