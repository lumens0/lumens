import type { Curso } from './cursos';

/**
 * SCRUM-399: os cursos de cada bloco de unidade, pelo slug do catálogo (`seed/blocos-ufal.ts`). É a
 * mesma divisão que soma a `baseEstudantes` de cada bloco, descrita em
 * `docs/operacao/bases-dos-blocos.md`: a meta é 10% dessa base, e agora só quem é desses cursos
 * apoia, então a base e quem conta para a meta são as mesmas pessoas.
 *
 * Bloco que não está aqui fica aberto a qualquer estudante verificado: espaços compartilhados
 * (`biblioteca-central`, `ru`, `bloco-07`, `bloco-13`, `bloco-18`, `ginasio`), lugares que não são
 * de curso (`residencia-universitaria`, `crad`) e o `csau`, que abriga
 * cursos de várias unidades e não diz quais. Pauta do campus inteiro (sem bloco) também é aberta.
 *
 * Tipado com `Curso`: nome fora da lista de `CURSOS` não compila.
 *
 * Aqui estão só os cursos **da própria unidade**. Cursos que têm aula em outro bloco
 * (`AULAS_EM_OUTROS_BLOCOS`) entram também: o que vale no banco é `CURSOS_DOS_BLOCOS`, mais abaixo.
 */
const CURSOS_DO_IC: readonly Curso[] = [
  'Ciência da Computação',
  'Engenharia de Computação',
  'Inteligência Artificial',
];

export const CURSOS_PROPRIOS_DOS_BLOCOS: Readonly<Record<string, readonly Curso[]>> = {
  ic: CURSOS_DO_IC,
  im: ['Matemática'],
  if: ['Física'],
  iqb: ['Química', 'Química Tecnológica e Industrial'],
  icbs: ['Ciências Biológicas'],
  famed: ['Medicina'],
  fanut: ['Nutrição'],
  eenf: ['Enfermagem'],
  foufal: ['Odontologia'],
  icf: ['Farmácia'],
  ctec: [
    'Engenharia Civil',
    'Engenharia Química',
    'Engenharia de Petróleo',
    'Engenharia Ambiental e Sanitária',
  ],
  fau: ['Arquitetura e Urbanismo', 'Design'],
  fda: ['Direito'],
  feac: ['Administração', 'Ciências Contábeis', 'Ciências Econômicas'],
  fale: [
    'Letras - Espanhol',
    'Letras - Francês',
    'Letras - Inglês',
    'Letras - Libras',
    'Letras - Português',
  ],
  fsso: ['Serviço Social'],
  ics: ['Ciências Sociais'],
  ichca: [
    'História',
    'Filosofia',
    'Jornalismo',
    'Relações Públicas',
    'Biblioteconomia',
    'Dança',
    'Teatro',
    'Música',
  ],
  icat: ['Meteorologia'],
  igdema: ['Geografia'],
  ip: ['Psicologia'],
  cedu: ['Pedagogia'],
  iefe: ['Educação Física'],
  // Subbloco de pesquisa do IC, atrás dele: os alunos que o frequentam são os do IC (`SUBBLOCOS`).
  cepetec: CURSOS_DO_IC,
  // O prédio da Comunicação Social, ao lado do IC.
  cos: ['Jornalismo', 'Relações Públicas'],
};

/**
 * Cursos de outras unidades que têm aula num bloco (SCRUM-399). A regra é direcional: quem cursa
 * Ciência da Computação tem aula no IM (o antigo Bloco 12, ligado ao IC), mas quem cursa Matemática
 * não tem aula no IC; por isso o IM aceita os cursos do IC e o IC não aceita os do IM.
 *
 * Informação da equipe (confirmada por um aluno de Ciência da Computação): as aulas de Matemática do
 * IC são no IM. Para acrescentar outro caso, escreva o bloco em que as aulas acontecem e os cursos
 * que as têm, e crie uma migração que insira os vínculos que faltam em `bloco_curso`, como a 0036.
 */
export const AULAS_EM_OUTROS_BLOCOS: Readonly<Record<string, readonly Curso[]>> = {
  im: ['Ciência da Computação', 'Engenharia de Computação', 'Inteligência Artificial'],
};

/**
 * Subblocos: blocos que são parte de outro, ou laboratórios dele, e têm os mesmos alunos. O CEPETEC
 * é o subbloco de pesquisa do IC; o EDGE Academy e o NEES (RIEH) são laboratórios fechados cuja base
 * de alunos são os do IC. Cada um aceita tudo o que o IC aceita, inclusive o que passar a valer para
 * o IC.
 */
export const SUBBLOCOS: Readonly<Record<string, string>> = {
  cepetec: 'ic',
  'edge-academy': 'ic',
  nees: 'ic',
};

function comAulasEmOutros(
  proprios: Readonly<Record<string, readonly Curso[]>>,
  aulas: Readonly<Record<string, readonly Curso[]>>,
): Readonly<Record<string, readonly Curso[]>> {
  const resultado: Record<string, readonly Curso[]> = { ...proprios };
  for (const [slug, cursos] of Object.entries(aulas)) {
    resultado[slug] = [...new Set([...(proprios[slug] ?? []), ...cursos])];
  }
  for (const [sub, pai] of Object.entries(SUBBLOCOS)) resultado[sub] = resultado[pai] ?? [];
  return resultado;
}

/** Os cursos que cada bloco aceita: os da própria unidade mais os que têm aula nele. É o que o banco guarda. */
export const CURSOS_DOS_BLOCOS = comAulasEmOutros(
  CURSOS_PROPRIOS_DOS_BLOCOS,
  AULAS_EM_OUTROS_BLOCOS,
);
