/**
 * O que o bot responde: texto, ou uma mensagem de lista do WhatsApp (o botão que abre um menu de
 * opções). A lista volta ao webhook como `interactive.list_reply`, e o worker entrega à conversa o
 * `id` da linha escolhida como se fosse o texto digitado (veja `inputOf`).
 *
 * Quem envia pela Cloud API (ainda o `logSender`) monta o payload a partir daqui: uma seção só,
 * sem título, com as linhas na ordem.
 */

export interface LinhaDaLista {
  /** O que volta como resposta quando a pessoa escolhe a linha. */
  id: string;
  titulo: string;
  descricao?: string;
}

export interface MensagemDeLista {
  tipo: 'lista';
  corpo: string;
  /** Texto do botão que abre a lista. */
  botao: string;
  linhas: LinhaDaLista[];
}

export type Resposta = string | MensagemDeLista;

/**
 * Limites da Meta para a mensagem de lista. Passou de algum, a Meta recusa a mensagem inteira — e
 * a pessoa fica sem resposta. Por isso `lista()` corta o texto em vez de confiar em quem chama.
 */
export const LIMITES_DA_LISTA = {
  linhas: 10,
  id: 200,
  titulo: 24,
  descricao: 72,
  botao: 20,
  corpo: 4096,
} as const;

/** Corta em `maximo` caracteres, terminando em "…". Conta por code point: emoji não parte ao meio. */
export function cortar(texto: string, maximo: number): string {
  const caracteres = [...texto.trim()];
  if (caracteres.length <= maximo) return caracteres.join('');
  return (
    caracteres
      .slice(0, maximo - 1)
      .join('')
      .trimEnd() + '…'
  );
}

/** Monta uma mensagem de lista dentro dos limites da Meta. Mais de 10 linhas é erro de quem chama. */
export function lista(mensagem: Omit<MensagemDeLista, 'tipo'>): MensagemDeLista {
  if (mensagem.linhas.length === 0 || mensagem.linhas.length > LIMITES_DA_LISTA.linhas) {
    throw new Error(`A lista precisa ter de 1 a ${String(LIMITES_DA_LISTA.linhas)} linhas.`);
  }
  return {
    tipo: 'lista',
    corpo: cortar(mensagem.corpo, LIMITES_DA_LISTA.corpo),
    botao: cortar(mensagem.botao, LIMITES_DA_LISTA.botao),
    linhas: mensagem.linhas.map((linha) => {
      if ([...linha.id].length > LIMITES_DA_LISTA.id) throw new Error('id da linha longo demais');
      const titulo = cortar(linha.titulo, LIMITES_DA_LISTA.titulo);
      return linha.descricao === undefined
        ? { id: linha.id, titulo }
        : { id: linha.id, titulo, descricao: cortar(linha.descricao, LIMITES_DA_LISTA.descricao) };
    }),
  };
}

/** A resposta como texto corrido: para o log do `pnpm dev` e para contar caracteres. */
export function textoDaResposta(resposta: Resposta): string {
  if (typeof resposta === 'string') return resposta;
  const linhas = resposta.linhas.map(
    (l) => `• ${l.titulo}${l.descricao === undefined ? '' : ` — ${l.descricao}`} [${l.id}]`,
  );
  return [resposta.corpo, `[${resposta.botao}]`, ...linhas].join('\n');
}
