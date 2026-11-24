import type { Curso } from './cursos';

/**
 * SCRUM-399: os cursos de cada bloco de unidade, pelo slug do catálogo (`seed/blocos-ufal.ts`). É a
 * mesma divisão que soma a `baseEstudantes` de cada bloco, descrita em
 * `docs/operacao/bases-dos-blocos.md`: a meta é 10% dessa base, e agora só quem é desses cursos
 * apoia, então a base e quem conta para a meta são as mesmas pessoas.
 *
 * Bloco que não está aqui fica aberto a qualquer estudante verificado: espaços compartilhados
 * (`biblioteca-central`, `ru`, `bloco-07`, `bloco-13`, `bloco-18`, `ginasio`), lugares que não são
 * de curso (`residencia-universitaria`, `edge-academy`, `nees`, `crad`) e o `csau`, que abriga
 * cursos de várias unidades e não diz quais. Pauta do campus inteiro (sem bloco) também é aberta.
 *
 * Tipado com `Curso`: nome fora da lista de `CURSOS` não compila.
 */
export const CURSOS_DOS_BLOCOS: Readonly<Record<string, readonly Curso[]>> = {
  ic: ['Ciência da Computação', 'Engenharia de Computação', 'Inteligência Artificial'],
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
  // Extensão do IC, atrás dele, e o prédio da Comunicação Social, ao lado.
  cepetec: ['Ciência da Computação', 'Engenharia de Computação', 'Inteligência Artificial'],
  cos: ['Jornalismo', 'Relações Públicas'],
};
