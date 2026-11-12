/**
 * O `*negrito*` do WhatsApp em `entities` do Telegram.
 *
 * As respostas do bot foram escritas para o WhatsApp, que lê `*assim*` como negrito. O Telegram
 * mostraria os asteriscos. Em vez de `parse_mode` (Markdown/HTML), que faria o Telegram interpretar
 * também o que a pessoa digitou e entra nas respostas (título de pauta, motivo de recusa), o
 * negrito vira uma `entity` com posição e tamanho, e os asteriscos saem do texto. Nada do texto é
 * interpretado pelo Telegram.
 *
 * Conservador de propósito: só conta um par `*…*` na mesma linha, com caractere que não é espaço
 * logo depois do primeiro e logo antes do segundo asterisco. Asterisco solto ("5 * 3", "nota*")
 * fica como está. `_itálico_` não é tratado: nenhuma resposta usa.
 *
 * Limitação conhecida: um título digitado com `*a*` também sai em negrito. É inofensivo: o texto
 * continua o mesmo, só sem os asteriscos.
 */

/** `MessageEntity` da Bot API. Posição e tamanho em unidades UTF-16, como o `length` do JS. */
export interface Entidade {
  type: 'bold';
  offset: number;
  length: number;
}

export interface TextoFormatado {
  text: string;
  entities: Entidade[];
}

/** `*` + não-espaço + (qualquer coisa sem `*` nem quebra de linha + não-espaço)? + `*`. */
const NEGRITO = /\*([^\s*](?:[^*\n]*[^\s*])?)\*/g;

/** Tira os marcadores de negrito do WhatsApp e devolve as `entities` equivalentes. Pura. */
export function negritoDoWhatsapp(texto: string): TextoFormatado {
  const entities: Entidade[] = [];
  let text = '';
  let desde = 0;
  for (const achado of texto.matchAll(NEGRITO)) {
    const dentro = achado[1] ?? '';
    text += texto.slice(desde, achado.index);
    entities.push({ type: 'bold', offset: text.length, length: dentro.length });
    text += dentro;
    desde = achado.index + achado[0].length;
  }
  text += texto.slice(desde);
  return { text, entities };
}

/**
 * Corta o texto em pedaços de até `limite` unidades UTF-16 (como o Telegram conta), de preferência
 * numa quebra de linha, sem partir emoji ao meio. Devolve onde cada pedaço começa e termina no
 * texto original; a quebra de linha do corte não entra em nenhum dos dois.
 */
export function cortes(texto: string, limite: number): { inicio: number; fim: number }[] {
  const partes: { inicio: number; fim: number }[] = [];
  let inicio = 0;
  while (texto.length - inicio > limite) {
    let corte = texto.lastIndexOf('\n', inicio + limite) - inicio;
    if (corte <= 0) {
      corte = limite;
      const codigo = texto.charCodeAt(inicio + corte - 1);
      if (codigo >= 0xd800 && codigo <= 0xdbff) corte--;
    }
    partes.push({ inicio, fim: inicio + corte });
    inicio += corte;
    if (texto[inicio] === '\n') inicio++;
  }
  partes.push({ inicio, fim: texto.length });
  return partes;
}

/**
 * Divide um texto com `entities` em mensagens de até `limite`. A posição de cada `entity` é
 * recalculada para o pedaço, e uma que cruzaria o corte vira duas, uma em cada pedaço: nenhuma
 * passa de uma mensagem para a outra.
 */
export function dividirFormatado(
  { text, entities }: TextoFormatado,
  limite: number,
): TextoFormatado[] {
  return cortes(text, limite).map(({ inicio, fim }) => ({
    text: text.slice(inicio, fim),
    entities: entities.flatMap((e) => {
      const de = Math.max(e.offset, inicio);
      const ate = Math.min(e.offset + e.length, fim);
      return ate > de ? [{ ...e, offset: de - inicio, length: ate - de }] : [];
    }),
  }));
}
