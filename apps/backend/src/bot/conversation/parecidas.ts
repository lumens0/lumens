/**
 * A lista de pautas parecidas e a escolha nela, usadas pelo relato (2.5, `relato.ts`) e pela pauta
 * nova pelo menu (SCRUM-346, `nova-pauta.ts`). Fica aqui para os dois fluxos não se importarem
 * um ao outro.
 */
import { z } from 'zod';
import { lista, type MensagemDeLista } from './resposta';
import { normalize } from './texto';

export const SIMILAR_LIST_TEXT =
  'Achei pautas abertas parecidas com o seu relato. Se uma delas for o mesmo problema, apoie a que já existe: pauta com mais apoio tem mais força.';

/** Linha que leva à pauta nova. */
export const OTHER_ROW_ID = 'outro';
const PAUTA_ROW_PREFIX = 'pauta:';

const OTHER = new Set([
  'outro',
  'outra',
  'e outro problema',
  'outro problema',
  'nenhuma',
  'nenhum',
]);

export const parecidaSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  descricao: z.string(),
});
export type Parecida = z.infer<typeof parecidaSchema>;

/** Até 3 pautas e "É outro problema". Título e descrição já cortados por `lista()`. */
export function listaDeParecidas(
  parecidas: readonly Parecida[],
  corpo: string = SIMILAR_LIST_TEXT,
): MensagemDeLista {
  return lista({
    corpo,
    botao: 'Ver pautas',
    linhas: [
      ...parecidas.map((p) => ({
        id: `${PAUTA_ROW_PREFIX}${p.id}`,
        titulo: p.titulo,
        descricao: p.descricao,
      })),
      { id: OTHER_ROW_ID, titulo: 'É outro problema', descricao: 'Criar uma pauta nova' },
    ],
  });
}

/** "É outro problema": a linha da lista ou a resposta escrita. */
export function escolheuOutro(resposta: string): boolean {
  return resposta.trim() === OTHER_ROW_ID || OTHER.has(normalize(resposta));
}

/** A pauta que a pessoa escolheu: a linha da lista, o número dela ou o título digitado. */
export function pautaEscolhida(
  resposta: string,
  parecidas: readonly Parecida[],
): Parecida | undefined {
  const bruta = resposta.trim();
  if (bruta.startsWith(PAUTA_ROW_PREFIX)) {
    return parecidas.find((p) => p.id === bruta.slice(PAUTA_ROW_PREFIX.length));
  }
  const texto = normalize(bruta);
  const numero = /^\d+$/.test(texto) ? Number(texto) : NaN;
  if (numero >= 1 && numero <= parecidas.length) return parecidas[numero - 1];
  return parecidas.find((p) => normalize(p.titulo) === texto);
}
