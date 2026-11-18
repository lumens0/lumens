/**
 * Categoria da pauta na conversa (2.6): montar a lista para a pessoa escolher e entender a
 * resposta, tocada na lista ou digitada. As categorias vêm do domínio, as mesmas do site.
 */
import { CATEGORIAS, ehCategoria, type Categoria } from '@lumens/dominio';
import { lista, type MensagemDeLista } from './resposta';
import { normalize } from './texto';

export const CATEGORY_QUESTION_TEXT = 'Qual é o tipo do problema?';
export const CATEGORY_NOT_FOUND_TEXT = 'Não achei essa categoria. Escolha uma na lista.';

/**
 * "Outra": o que não se encaixa. A pauta segue sem categoria e a curadoria classifica ao aprovar
 * (decisão do SCRUM-357: `outra` não é uma categoria do site).
 */
export const OTHER_CATEGORY = 'outra';
const OTHER_CATEGORY_LABEL = 'Outra';

const CATEGORY_ROW_PREFIX = 'categoria:';

export type EscolhaDeCategoria = Categoria | typeof OTHER_CATEGORY;

export function listaDeCategorias(): MensagemDeLista {
  return lista({
    corpo: CATEGORY_QUESTION_TEXT,
    botao: 'Escolher categoria',
    linhas: [
      ...Object.entries(CATEGORIAS).map(([id, rotulo]) => ({
        id: `${CATEGORY_ROW_PREFIX}${id}`,
        titulo: rotulo,
      })),
      { id: `${CATEGORY_ROW_PREFIX}${OTHER_CATEGORY}`, titulo: OTHER_CATEGORY_LABEL },
    ],
  });
}

/** A categoria escolhida: a linha da lista ou o nome digitado ("Segurança", "seguranca"). */
export function categoriaEscolhida(resposta: string): EscolhaDeCategoria | undefined {
  const bruta = resposta.trim();
  const digitado = normalize(
    bruta.startsWith(CATEGORY_ROW_PREFIX) ? bruta.slice(CATEGORY_ROW_PREFIX.length) : bruta,
  );
  if (digitado === OTHER_CATEGORY) return OTHER_CATEGORY;
  if (ehCategoria(digitado)) return digitado;
  return Object.entries(CATEGORIAS).find(([, rotulo]) => normalize(rotulo) === digitado)?.[0] as
    Categoria | undefined;
}
