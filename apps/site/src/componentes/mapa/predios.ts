/**
 * Prédios do Campus A. C. Simões com o contorno real, do OpenStreetMap (`campus-osm.ts`, gerado
 * por `apps/site/scripts/campus-osm.py`). Unidade: metros, com o norte para cima.
 *
 * `BLOCOS_DO_PREDIO` liga o prédio aos blocos do banco pelo slug. Bloco sem prédio aqui aparece só
 * na lista; quando os blocos oficiais forem cadastrados, é só acrescentar o slug.
 */
import { AREAS_OSM, PREDIOS_OSM } from './campus-osm';

export { ALTURA_DO_CAMPUS, CAMINHOS, CONTORNO, LARGURA_DO_CAMPUS } from './campus-osm';

export interface Predio {
  /** Id do prédio no OpenStreetMap. */
  id: number;
  nome: string;
  /** Nome curto para o rótulo no mapa. */
  sigla: string;
  /** Contorno em `d` de `<path>`. */
  d: string;
  /** `[x, y, largura, altura]` do contorno. */
  caixa: readonly number[];
  blocos: readonly string[];
}

// Slugs do catálogo real de blocos (`packages/db/seed/blocos-ufal.ts`, SCRUM-292). Bloco sem prédio
// aqui aparece só na lista: faltam IQB, FANUT, EENF, FOUFAL, ICF, FALE, ICS, IEFE, FAU e FDA, que o
// OpenStreetMap não traz como prédio nomeado.
const BLOCOS_DO_PREDIO: Record<number, readonly string[]> = {
  202492816: ['ic'], // IC - Instituto de Computação
  1341542148: ['im'], // Instituto de Matemática
  64975419: ['if'], // Instituto de Física
  1338403227: ['icbs'],
  259323643: ['famed'],
  288826603: ['ctec'], // Novo CTEC
  326103196: ['feac'],
  64963102: ['fsso'],
  64963499: ['ichca'],
  64963258: ['icat'], // Instituto de Meteorologia
  64962904: ['igdema'],
  493988328: ['ip'],
  64974358: ['cedu'],
  64974284: ['csau'], // Centro de Ciências da Saúde - CSAU
  202492922: ['biblioteca-central'],
  288827034: ['ru'], // Restaurante Universitário
  544426692: ['praca-de-alimentacao'],
  64963500: ['bloco-18'], // Bloco 18 - João de Deus
  64980223: ['bloco-07'], // Bloco 07 - Salas de Aula
  64963507: ['bloco-13'],
  64963326: ['ginasio'], // Ginásio da UFAL
};

/**
 * Nome e sigla de prédios que o OpenStreetMap não nomeia, pelo id do OSM (SCRUM-284). Só entra
 * aqui o que alguém que conhece o campus confirmou; o melhor lugar para corrigir é o próprio OSM,
 * que beneficia todo mundo. O script `campus-osm.py` traz o nome do OSM de volta quando existir.
 */
const NOMES_LOCAIS: Record<number, { nome: string; sigla: string }> = {
  404591641: { nome: 'Centro de Interesse Comunitário', sigla: 'CIC' }, // `description` e `ref` no OSM
};

const SIGLAS: Record<string, string> = {
  'Instituto de Geografia, Desenvolvimento e Meio Ambiente': 'IGDEMA',
  'Faculdade de Serviço Social': 'FSSO',
  'Instituto de Meteorologia': 'ICAT',
  'Antigo Restaurante Universitário': 'Antigo RU',
  'Restaurante Universitário': 'RU',
  'Núcleo de Pesquisas Multidisciplinar': 'NPM',
  'Núcleo de Desenvolvimento Infantil': 'NDI',
  'Faculdade de Economia, Administração e Contabilidade': 'FEAC',
  'Instituto de Computação e Instituto de Matemática': 'IC e IM',
  'Instituto de Matemática': 'IM',
  'Instituto de Física': 'IF',
  'Centro de Educação': 'CEDU',
  'Polo Maceió EAD': 'EAD',
  'Praça de Alimentação UFAL': 'Praça de alimentação',
  'Centro de Pesquisa de Tecnologia Digitais para Educação (CPTEC)': 'CPTEC',
  'Posto de Meteorologia': 'Posto meteorológico',
  'Comunicação Social': 'COS',
  'Bloco 06 - IGDEMA': 'Bloco 06',
  'Ginásio da UFAL': 'Ginásio',
};

/** "Bloco 18 - João de Deus" vira "Bloco 18"; "Centro de Ciências da Saúde - CSAU" vira "CSAU". */
export function siglaDe(nome: string): string {
  const sigla = SIGLAS[nome];
  if (sigla) return sigla;
  // "Bloco 05 do ICBS" vira "ICBS 05": a sigla do instituto vem antes, como nas placas.
  const doInstituto = /^Bloco (\d+) do (\S+)$/.exec(nome);
  if (doInstituto) return `${doInstituto[2] ?? ''} ${doInstituto[1] ?? ''}`;
  const [antes, depois] = nome.split(' - ');
  if (depois === undefined || antes === undefined) return nome;
  return antes.length <= depois.length ? antes : depois;
}

export const PREDIOS: readonly Predio[] = PREDIOS_OSM.map(([id, nomeOsm, d, caixa, curto]) => {
  const local = NOMES_LOCAIS[id];
  const nome = nomeOsm || local?.nome || '';
  // A sigla do OSM (`short_name`, `ref`) vale quando tem 3 letras ou mais: "13" não diz nada.
  const sigla = nomeOsm
    ? (SIGLAS[nomeOsm] ?? (curto.length >= 3 ? curto : siglaDe(nomeOsm)))
    : (local?.sigla ?? curto);
  return {
    id,
    nome: nome || 'Prédio sem nome no mapa',
    sigla: nome ? sigla || siglaDe(nome) : '',
    d,
    caixa,
    blocos: BLOCOS_DO_PREDIO[id] ?? [],
  };
});

export type TipoDeArea = 'pista' | 'quadra' | 'agua' | 'parque' | 'estacionamento';

/** Área aberta do campus: pista de atletismo, quadras, parque, estacionamentos. */
export interface Area {
  id: number;
  tipo: TipoDeArea;
  /** Vazio: a área é desenhada, mas não leva rótulo. */
  nome: string;
  d: string;
  caixa: readonly number[];
}

export const AREAS: readonly Area[] = AREAS_OSM.map(([id, tipo, nome, d, caixa]) => ({
  id,
  tipo: tipo as TipoDeArea,
  nome,
  d,
  caixa,
}));
