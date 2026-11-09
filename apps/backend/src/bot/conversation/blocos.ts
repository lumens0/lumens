/**
 * Blocos na conversa: achar o bloco citado num relato, entender a escolha da pessoa e montar a
 * lista para ela escolher. Usado pelo relato (2.5) e pela pauta nova (2.6).
 */
import { palavrasDe, type BlocoParaRelato } from '@lumens/dominio';
import { lista, type MensagemDeLista } from './resposta';

export const BLOCK_QUESTION_TEXT = 'Em que bloco é o problema?';
export const BLOCK_NOT_FOUND_TEXT = 'Não achei esse bloco. Escolha um na lista.';

/** Linha da lista de blocos para quem não sabe ou fala do campus inteiro. */
export const CAMPUS_ROW_ID = 'bloco:campus';
const BLOCK_ROW_PREFIX = 'bloco:';

const CAMPUS = new Set(['campus', 'todo o campus', 'nao sei', 'nenhum', 'outro']);

/** "Bloco 18 (fictício)" → "bloco 18": o nome como alguém escreveria. */
function nomeComparavel(nome: string): string {
  return palavrasDe(nome.replace(/\([^)]*\)/g, '')).join(' ');
}

/**
 * O bloco que o relato cita pelo nome inteiro ("bebedouro do bloco 18 quebrado"). Só quando é um
 * só: com dois ou nenhum, pergunta. Nome inteiro e palavra inteira, para "bloco 1" não casar com
 * "bloco 18".
 */
export function blocoCitado(
  relato: string,
  blocos: readonly BlocoParaRelato[],
): BlocoParaRelato | undefined {
  const texto = ` ${palavrasDe(relato).join(' ')} `;
  const citados = blocos.filter((b) => {
    const nome = nomeComparavel(b.nome);
    return nome !== '' && texto.includes(` ${nome} `);
  });
  return citados.length === 1 ? citados[0] : undefined;
}

/**
 * O bloco que a pessoa escolheu: a linha da lista, ou o nome digitado — inteiro ("Bloco de
 * Artes") ou um pedaço que só um bloco tem ("artes", "18"). `null` é o campus inteiro;
 * `undefined`, que não deu para saber.
 */
export function blocoEscolhido(
  resposta: string,
  blocos: readonly BlocoParaRelato[],
): { blocoId: string | null } | undefined {
  const bruta = resposta.trim();
  if (bruta === CAMPUS_ROW_ID) return { blocoId: null };
  if (bruta.startsWith(BLOCK_ROW_PREFIX)) {
    const id = bruta.slice(BLOCK_ROW_PREFIX.length);
    return blocos.some((b) => b.id === id) ? { blocoId: id } : undefined;
  }

  const digitado = palavrasDe(bruta).join(' ');
  if (digitado === '') return undefined;
  if (CAMPUS.has(digitado)) return { blocoId: null };
  const exato = blocos.find(
    (b) => nomeComparavel(b.nome) === digitado || palavrasDe(b.slug).join(' ') === digitado,
  );
  if (exato) return { blocoId: exato.id };
  const contem = blocos.filter((b) => ` ${nomeComparavel(b.nome)} `.includes(` ${digitado} `));
  const [unico] = contem;
  return contem.length === 1 && unico ? { blocoId: unico.id } : undefined;
}

/** Lista de blocos. Cabem 9 e a linha do campus; com mais, a pessoa pode digitar o nome. */
export function listaDeBlocos(blocos: readonly BlocoParaRelato[]): MensagemDeLista {
  const cabem = blocos.slice(0, 9);
  const corpo =
    cabem.length < blocos.length
      ? `${BLOCK_QUESTION_TEXT} Se o seu não está na lista, escreva o nome dele.`
      : BLOCK_QUESTION_TEXT;
  return lista({
    corpo,
    botao: 'Escolher bloco',
    linhas: [
      ...cabem.map((b) => ({ id: `${BLOCK_ROW_PREFIX}${b.id}`, titulo: b.nome })),
      { id: CAMPUS_ROW_ID, titulo: 'Todo o campus / não sei' },
    ],
  });
}
