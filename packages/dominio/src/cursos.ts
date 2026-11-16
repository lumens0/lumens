/**
 * SCRUM-296 · Acha o curso que o estudante digitou na verificação (2.4).
 *
 * Com os 43 cursos do campus, quase todo mundo vai digitar o curso em vez de achá-lo nos 9 da
 * lista. A busca aceita, nesta ordem:
 *
 * 1. o nome completo, sem diferença de acento, maiúscula ou pontuação ("letras portugues");
 * 2. as siglas e apelidos mais comuns (`APELIDOS`: "CC", "IA", "RP"...);
 * 3. começos de palavra com 3 letras ou mais ("odonto", "psico", "eng civil").
 *
 * Mais de um curso serve (ex.: "computação", "letras")? Devolve todos, para o bot mostrar só esses
 * numa lista. O resultado é sempre um nome de `CURSOS`: o que a pessoa digitou nunca vai para o
 * cadastro, porque o curso aparece no site.
 */
import { CURSOS, type Curso } from '@lumens/db';

export type BuscaDeCurso =
  | { tipo: 'um'; curso: Curso }
  | { tipo: 'varios'; cursos: Curso[] }
  | { tipo: 'nenhum' };

/** Quantos cursos o bot mostra quando o texto serve para mais de um (cabe numa lista). */
export const MAX_CANDIDATOS = 9;

/** Começo de palavra mais curto que vale: "ma" acharia "Matemática" e "Música" por acaso. */
const PREFIXO_MINIMO = 3;

/** Palavras que não ajudam a achar o curso. */
const VAZIAS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'em',
  'curso',
  'faco',
  'graduacao',
  'bacharelado',
  'licenciatura',
]);

/**
 * Siglas e apelidos que o começo de palavra não resolve sozinho, já na forma de `chave`. Só os
 * que apontam para um curso sem dúvida: "computação" vale para dois, então fica de fora.
 */
export const APELIDOS: Readonly<Record<string, Curso>> = {
  cc: 'Ciência da Computação',
  bcc: 'Ciência da Computação',
  ccomp: 'Ciência da Computação',
  ecomp: 'Engenharia de Computação',
  ia: 'Inteligência Artificial',
  rp: 'Relações Públicas',
  qti: 'Química Tecnológica e Industrial',
  ef: 'Educação Física',
  'ed fisica': 'Educação Física',
  biologia: 'Ciências Biológicas',
  economia: 'Ciências Econômicas',
  contabilidade: 'Ciências Contábeis',
  arquitetura: 'Arquitetura e Urbanismo',
};

/** "Letras - Português" → "letras portugues": sem acento, minúsculas, só letras e números. */
export function chave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function palavras(texto: string): string[] {
  return chave(texto)
    .split(' ')
    .filter((p) => p !== '' && !VAZIAS.has(p));
}

const POR_CHAVE = new Map<string, Curso>(CURSOS.map((curso) => [chave(curso), curso]));
const PALAVRAS_DO_CURSO = CURSOS.map((curso) => ({ curso, palavras: palavras(curso) }));

export function buscarCurso(texto: string): BuscaDeCurso {
  const exato = POR_CHAVE.get(chave(texto)) ?? APELIDOS[chave(texto)];
  if (exato !== undefined) return { tipo: 'um', curso: exato };

  const digitadas = palavras(texto);
  if (digitadas.length === 0 || digitadas.some((p) => p.length < PREFIXO_MINIMO)) {
    return { tipo: 'nenhum' };
  }
  // Toda palavra digitada tem de ser começo de alguma palavra do curso.
  const servem = PALAVRAS_DO_CURSO.filter((c) =>
    digitadas.every((d) => c.palavras.some((p) => p.startsWith(d))),
  ).map((c) => c.curso);

  const [unico] = servem;
  if (unico === undefined || servem.length > MAX_CANDIDATOS) return { tipo: 'nenhum' };
  if (servem.length === 1) return { tipo: 'um', curso: unico };
  return { tipo: 'varios', cursos: servem };
}
