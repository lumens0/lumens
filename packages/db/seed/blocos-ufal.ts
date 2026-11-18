/**
 * Catálogo dos blocos reais do campus A. C. Simões (SCRUM-292). É para o banco da homologação e da
 * produção, que não rodam o seed de desenvolvimento (ele cria blocos "(fictício)").
 *
 * ATENÇÃO: `baseEstudantes` é ESTIMATIVA (vagas do SiSU × duração do curso, nos espaços
 * compartilhados uma fração dos cerca de 14 mil do campus). A equipe é de estudantes e não tem
 * acesso à PROGRAD: as estimativas são assumidas (SCRUM-292). A meta de cada pauta congela na
 * criação (decisão 3 do SCRUM-80); se surgir número oficial, corrija com UPDATE em `bloco`
 * enquanto não houver pauta no bloco.
 */
import { blocos, type Db } from '../src/index';

export const blocosUfal = [
  { slug: 'ic', nome: 'IC - Instituto de Computação', baseEstudantes: 550 },
  { slug: 'im', nome: 'IM - Instituto de Matemática', baseEstudantes: 500 },
  { slug: 'if', nome: 'IF - Instituto de Física', baseEstudantes: 350 },
  { slug: 'iqb', nome: 'IQB - Instituto de Química e Biotecnologia', baseEstudantes: 600 },
  { slug: 'icbs', nome: 'ICBS - Instituto de Ciências Biológicas e da Saúde', baseEstudantes: 350 },
  { slug: 'famed', nome: 'FAMED - Faculdade de Medicina', baseEstudantes: 500 },
  { slug: 'fanut', nome: 'FANUT - Faculdade de Nutrição', baseEstudantes: 250 },
  { slug: 'eenf', nome: 'EENF - Escola de Enfermagem', baseEstudantes: 300 },
  { slug: 'foufal', nome: 'FOUFAL - Faculdade de Odontologia', baseEstudantes: 250 },
  { slug: 'icf', nome: 'ICF - Instituto de Ciências Farmacêuticas', baseEstudantes: 250 },
  { slug: 'ctec', nome: 'CTEC - Centro de Tecnologia', baseEstudantes: 1000 },
  { slug: 'fau', nome: 'FAU - Faculdade de Arquitetura e Urbanismo', baseEstudantes: 550 },
  { slug: 'fda', nome: 'FDA - Faculdade de Direito', baseEstudantes: 800 },
  { slug: 'feac', nome: 'FEAC', baseEstudantes: 1500 },
  { slug: 'fale', nome: 'FALE - Faculdade de Letras', baseEstudantes: 1000 },
  { slug: 'fsso', nome: 'FSSO - Faculdade de Serviço Social', baseEstudantes: 450 },
  { slug: 'ics', nome: 'ICS - Instituto de Ciências Sociais', baseEstudantes: 300 },
  { slug: 'ichca', nome: 'ICHCA', baseEstudantes: 1600 },
  { slug: 'icat', nome: 'ICAT - Instituto de Ciências Atmosféricas', baseEstudantes: 200 },
  { slug: 'igdema', nome: 'IGDEMA', baseEstudantes: 600 },
  { slug: 'ip', nome: 'IP - Instituto de Psicologia', baseEstudantes: 400 },
  { slug: 'cedu', nome: 'CEDU - Centro de Educação', baseEstudantes: 700 },
  { slug: 'iefe', nome: 'IEFE - Instituto de Educação Física e Esporte', baseEstudantes: 400 },
  { slug: 'csau', nome: 'CSAU - Centro de Ciências da Saúde', baseEstudantes: 1500 },
  { slug: 'biblioteca-central', nome: 'Biblioteca Central', baseEstudantes: 7000 },
  { slug: 'ru', nome: 'RU - Restaurante Universitário', baseEstudantes: 6000 },
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
