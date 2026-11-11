/**
 * Os cursos que o estudante pode escolher na verificação (2.4). O curso de quem cuida da pauta
 * aparece no site (`cursos_responsaveis` em `v_pauta_publica`), então só vale curso desta lista:
 * texto livre poderia levar um nome de pessoa para a página pública.
 *
 * É a lista do seed. Para pôr os cursos reais da UFAL, basta trocá-la aqui: o bot mostra até 9
 * numa mensagem de lista e aceita o nome digitado dos outros.
 */
export const CURSOS = [
  'Administração',
  'Arquitetura e Urbanismo',
  'Ciência da Computação',
  'Direito',
  'Enfermagem',
  'Engenharia Civil',
  'Jornalismo',
  'Pedagogia',
] as const;

export type Curso = (typeof CURSOS)[number];
