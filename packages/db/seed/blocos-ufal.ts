/**
 * Catálogo dos blocos reais do campus A. C. Simões (SCRUM-292). É para o banco da homologação e da
 * produção, que não rodam o seed de desenvolvimento (ele cria blocos "(fictício)").
 *
 * `baseEstudantes` dos institutos, faculdades e centros vem dos **alunos ativos por curso** do
 * relatório oficial da UFAL (NTI, SIE Web, gerado em 10/06/2020; período 2020.1, só graduação
 * presencial do campus de Maceió): a soma dos cursos de cada unidade. A tabela curso a curso, a
 * fonte e o que ficou de fora estão em `docs/operacao/bases-dos-blocos.md`. É o dado oficial mais
 * detalhado que a UFAL publica; a matrícula de hoje é um pouco maior.
 *
 * Seguem como ESTIMATIVA da equipe (sem número oficial): o CSAU (prédio que abriga cursos de várias
 * unidades), os espaços compartilhados (Biblioteca, RU, blocos de aula, Ginásio: uma fração dos
 * cerca de 15 mil estudantes de graduação do campus) e os lugares que não são bloco de curso
 * (EDGE Academy, NEES, CRAD). A Residência Universitária usa a capacidade informada pela UFAL
 * (até 135 estudantes). A meta de cada pauta congela na criação (decisão 3 do SCRUM-80); se surgir
 * número melhor, corrija com UPDATE em `bloco` enquanto não houver pauta no bloco.
 */
import { blocos, type Db } from '../src/index';

export const blocosUfal = [
  { slug: 'ic', nome: 'IC - Instituto de Computação', baseEstudantes: 585 },
  { slug: 'im', nome: 'IM - Instituto de Matemática', baseEstudantes: 457 },
  { slug: 'if', nome: 'IF - Instituto de Física', baseEstudantes: 228 },
  { slug: 'iqb', nome: 'IQB - Instituto de Química e Biotecnologia', baseEstudantes: 698 },
  { slug: 'icbs', nome: 'ICBS - Instituto de Ciências Biológicas e da Saúde', baseEstudantes: 635 },
  { slug: 'famed', nome: 'FAMED - Faculdade de Medicina', baseEstudantes: 537 },
  { slug: 'fanut', nome: 'FANUT - Faculdade de Nutrição', baseEstudantes: 300 },
  { slug: 'eenf', nome: 'EENF - Escola de Enfermagem', baseEstudantes: 285 },
  { slug: 'foufal', nome: 'FOUFAL - Faculdade de Odontologia', baseEstudantes: 282 },
  { slug: 'icf', nome: 'ICF - Instituto de Ciências Farmacêuticas', baseEstudantes: 276 },
  { slug: 'ctec', nome: 'CTEC - Centro de Tecnologia', baseEstudantes: 1019 },
  { slug: 'fau', nome: 'FAU - Faculdade de Arquitetura e Urbanismo', baseEstudantes: 736 },
  { slug: 'fda', nome: 'FDA - Faculdade de Direito', baseEstudantes: 823 },
  { slug: 'feac', nome: 'FEAC', baseEstudantes: 1859 },
  { slug: 'fale', nome: 'FALE - Faculdade de Letras', baseEstudantes: 883 },
  { slug: 'fsso', nome: 'FSSO - Faculdade de Serviço Social', baseEstudantes: 583 },
  { slug: 'ics', nome: 'ICS - Instituto de Ciências Sociais', baseEstudantes: 376 },
  { slug: 'ichca', nome: 'ICHCA', baseEstudantes: 2046 },
  { slug: 'icat', nome: 'ICAT - Instituto de Ciências Atmosféricas', baseEstudantes: 178 },
  { slug: 'igdema', nome: 'IGDEMA', baseEstudantes: 635 },
  { slug: 'ip', nome: 'IP - Instituto de Psicologia', baseEstudantes: 390 },
  { slug: 'cedu', nome: 'CEDU - Centro de Educação', baseEstudantes: 1139 },
  { slug: 'iefe', nome: 'IEFE - Instituto de Educação Física e Esporte', baseEstudantes: 638 },
  { slug: 'csau', nome: 'CSAU - Centro de Ciências da Saúde', baseEstudantes: 1500 },
  { slug: 'biblioteca-central', nome: 'Biblioteca Central', baseEstudantes: 7000 },
  { slug: 'ru', nome: 'RU - Restaurante Universitário', baseEstudantes: 6000 },
  // Prédios que o mapa já desenhava: o CEPETEC fica atrás do IC (extensão dele) e o COS, ao lado.
  // Bases estimadas pela equipe, sem número oficial (Jornalismo e Relações Públicas, do COS, já
  // entram na conta do ICHCA).
  { slug: 'cepetec', nome: 'CEPETEC - Centro de Pesquisa Tecnológica do IC', baseEstudantes: 100 },
  { slug: 'cos', nome: 'COS - Comunicação Social', baseEstudantes: 400 },
  // Em frente ao RU. Base: a capacidade da residência, de até 135 estudantes (site da UFAL).
  { slug: 'residencia-universitaria', nome: 'Residência Universitária', baseEstudantes: 135 },
  // Lugares que o mapa do site desenha e o OpenStreetMap não tem (EDGE Academy, NEES e CRAD), na
  // posição do Google Maps. Base estimada, como as demais (palpite da equipe).
  { slug: 'edge-academy', nome: 'EDGE Academy', baseEstudantes: 100 }, // informado pela equipe
  { slug: 'nees', nome: 'NEES (RIEH)', baseEstudantes: 100 }, // sem número oficial: o mesmo da EDGE Academy
  { slug: 'crad', nome: 'CRAD', baseEstudantes: 50 }, // não é bloco estudantil: estimativa baixa
  { slug: 'bloco-18', nome: 'Bloco 18', baseEstudantes: 2000 },
  { slug: 'bloco-07', nome: 'Bloco 07', baseEstudantes: 2000 },
  { slug: 'bloco-13', nome: 'Bloco 13', baseEstudantes: 1500 },
  { slug: 'ginasio', nome: 'Ginásio da UFAL', baseEstudantes: 1000 },
] as const;

/** Cadastra os blocos que faltam, pelo slug; não mexe em bloco que já existe. */
export async function cadastrarBlocosUfal(db: Db): Promise<number> {
  const novos = await db
    .insert(blocos)
    .values(blocosUfal.map((b) => ({ ...b })))
    .onConflictDoNothing({ target: blocos.slug })
    .returning({ id: blocos.id });
  return novos.length;
}
