/**
 * O que o bot responde: texto, uma mensagem de lista do WhatsApp (o botão que abre um menu de
 * opções) ou uma mensagem com até 3 botões de resposta. A escolha volta ao webhook como
 * `interactive.list_reply` ou `interactive.button_reply`, e o worker entrega à conversa o `id` da
 * linha ou do botão como se fosse o texto digitado (veja `inputOf`).
 *
 * Quem envia pela Cloud API (ainda o `logSender`) monta o payload a partir daqui, depois de
 * `dentroDosLimitesDaMeta`: uma seção só, sem título, com as linhas na ordem.
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

export interface BotaoDeResposta {
  /** O que volta como resposta quando a pessoa toca no botão. */
  id: string;
  titulo: string;
}

export interface MensagemDeBotoes {
  tipo: 'botoes';
  corpo: string;
  botoes: BotaoDeResposta[];
}

/**
 * Imagem por link, com legenda (o card da pauta, 2.9). O canal baixa a imagem do link; quem não
 * consegue mandar a imagem manda só a legenda, que leva o link da pauta.
 */
export interface MensagemDeImagem {
  tipo: 'imagem';
  /** URL pública em https: quem baixa é o servidor do canal, não o bot. */
  url: string;
  legenda: string;
}

export type Resposta = string | MensagemDeLista | MensagemDeBotoes | MensagemDeImagem;

/**
 * Limites da Meta para a mensagem de lista. Passou de algum, a Meta recusa a mensagem inteira — e
 * a pessoa fica sem resposta. Por isso `dentroDosLimitesDaMeta` corta o texto em vez de confiar em
 * quem chama. O corte é do canal (SCRUM-323): `lista()` monta com o texto inteiro, e só o envio
 * pela Cloud API da Meta corta. O Telegram mostra nomes maiores; a Evolution manda o menu em texto.
 */
export const LIMITES_DA_LISTA = {
  linhas: 10,
  id: 200,
  titulo: 24,
  descricao: 72,
  botao: 20,
  corpo: 4096,
} as const;

/** Limites da Meta para a mensagem com botões (`interactive.type = "button"`). */
export const LIMITES_DOS_BOTOES = {
  botoes: 3,
  id: 256,
  titulo: 20,
  corpo: 1024,
} as const;

/** Corta em `maximo` caracteres, terminando em "…". Conta por code point: emoji não parte ao meio. */
export function cortar(texto: string, maximo: number): string {
  const caracteres = Array.from(texto.trim());
  if (caracteres.length <= maximo) return caracteres.join('');
  return (
    caracteres
      .slice(0, maximo - 1)
      .join('')
      .trimEnd() + '…'
  );
}

/**
 * Monta uma mensagem de lista com o texto inteiro (SCRUM-323): o corte é do canal. Confere só o que
 * vale em todo canal: de 1 a 10 linhas e o tamanho do id, que volta como resposta.
 */
export function lista(mensagem: Omit<MensagemDeLista, 'tipo'>): MensagemDeLista {
  if (mensagem.linhas.length === 0 || mensagem.linhas.length > LIMITES_DA_LISTA.linhas) {
    throw new Error(`A lista precisa ter de 1 a ${String(LIMITES_DA_LISTA.linhas)} linhas.`);
  }
  for (const linha of mensagem.linhas) {
    if (Array.from(linha.id).length > LIMITES_DA_LISTA.id) {
      throw new Error('id da linha longo demais');
    }
  }
  return { tipo: 'lista', ...mensagem };
}

/** Monta uma mensagem com botões, com o texto inteiro (SCRUM-323). Mais de 3 é erro de quem chama. */
export function botoes(mensagem: Omit<MensagemDeBotoes, 'tipo'>): MensagemDeBotoes {
  if (mensagem.botoes.length === 0 || mensagem.botoes.length > LIMITES_DOS_BOTOES.botoes) {
    throw new Error(`A mensagem precisa ter de 1 a ${String(LIMITES_DOS_BOTOES.botoes)} botões.`);
  }
  for (const botao of mensagem.botoes) {
    if (Array.from(botao.id).length > LIMITES_DOS_BOTOES.id) {
      throw new Error('id do botão longo demais');
    }
  }
  return { tipo: 'botoes', ...mensagem };
}

/**
 * A resposta cortada nos limites da Meta (SCRUM-323). Quem envia pela Cloud API do WhatsApp chama
 * isto antes de montar o payload; os outros canais recebem o texto inteiro.
 *
 * LEGADO: nenhum código de produção chama esta função hoje. O canal em uso é a Evolution
 * (SCRUM-275), que manda o menu em texto, e o envio pela Cloud API da Meta não existe (o número de
 * produção está bloqueado). Fica para o dia em que esse envio for escrito; quem o escrever deve
 * chamá-la antes de montar o payload, ou apagá-la com os testes se a Cloud API for abandonada.
 */
export function dentroDosLimitesDaMeta(resposta: Resposta): Resposta {
  if (typeof resposta === 'string' || resposta.tipo === 'imagem') return resposta;
  if (resposta.tipo === 'botoes') {
    return {
      tipo: 'botoes',
      corpo: cortar(resposta.corpo, LIMITES_DOS_BOTOES.corpo),
      botoes: resposta.botoes.map((b) => ({
        id: b.id,
        titulo: cortar(b.titulo, LIMITES_DOS_BOTOES.titulo),
      })),
    };
  }
  return {
    tipo: 'lista',
    corpo: cortar(resposta.corpo, LIMITES_DA_LISTA.corpo),
    botao: cortar(resposta.botao, LIMITES_DA_LISTA.botao),
    linhas: resposta.linhas.map((linha) => {
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
  if (resposta.tipo === 'imagem') return `${resposta.legenda}\n[imagem: ${resposta.url}]`;
  if (resposta.tipo === 'botoes') {
    return [resposta.corpo, ...resposta.botoes.map((b) => `[${b.titulo}] (${b.id})`)].join('\n');
  }
  const linhas = resposta.linhas.map(
    (l) => `• ${l.titulo}${l.descricao === undefined ? '' : ` — ${l.descricao}`} [${l.id}]`,
  );
  return [resposta.corpo, `[${resposta.botao}]`, ...linhas].join('\n');
}
