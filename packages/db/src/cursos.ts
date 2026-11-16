/**
 * Os cursos que o estudante pode escolher na verificação (2.4). O curso de quem cuida da pauta
 * aparece no site (`cursos_responsaveis` em `v_pauta_publica`), então só vale curso desta lista:
 * texto livre poderia levar um nome de pessoa para a página pública.
 *
 * Fonte (SCRUM-296, consultada em 16/11/2026): SIGAA da UFAL, "Consulta de Cursos — Graduação"
 * (https://sigaa.sig.ufal.br/sigaa/public/curso/lista.jsf?nivel=G&aba=p-graduacao), cursos
 * presenciais com sede em Maceió (Campus A. C. Simões). Regras usadas para chegar aos nomes:
 *
 * - um nome por curso: o SIGAA repete o curso por turno (matutino, noturno...) e por grau
 *   (bacharelado, licenciatura), e o site mostra só o nome;
 * - nomes antigos juntados ao atual: "Comunicação Social (Jornalismo)" → "Jornalismo",
 *   "Comunicação Social (Relações Públicas)" → "Relações Públicas", "Música (Canto)" → "Música";
 * - "Letras" fica por habilitação ("Letras - Inglês"...), como o SIGAA separa;
 * - de fora: os cursos EAD (são de polos, não do campus) e os de Rio Largo (CECA, outro campus).
 *
 * Em ordem alfabética: o bot mostra os 9 primeiros numa mensagem de lista e aceita o nome digitado
 * dos outros (`buscarCurso`, no domínio).
 */
export const CURSOS = [
  'Administração',
  'Arquitetura e Urbanismo',
  'Biblioteconomia',
  'Ciência da Computação',
  'Ciências Biológicas',
  'Ciências Contábeis',
  'Ciências Econômicas',
  'Ciências Sociais',
  'Dança',
  'Design',
  'Direito',
  'Educação Física',
  'Enfermagem',
  'Engenharia Ambiental e Sanitária',
  'Engenharia Civil',
  'Engenharia de Computação',
  'Engenharia de Petróleo',
  'Engenharia Química',
  'Farmácia',
  'Filosofia',
  'Física',
  'Geografia',
  'História',
  'Inteligência Artificial',
  'Jornalismo',
  'Letras - Espanhol',
  'Letras - Francês',
  'Letras - Inglês',
  'Letras - Libras',
  'Letras - Português',
  'Matemática',
  'Medicina',
  'Meteorologia',
  'Música',
  'Nutrição',
  'Odontologia',
  'Pedagogia',
  'Psicologia',
  'Química',
  'Química Tecnológica e Industrial',
  'Relações Públicas',
  'Serviço Social',
  'Teatro',
] as const;

export type Curso = (typeof CURSOS)[number];
