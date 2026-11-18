/**
 * Prédios do Campus A. C. Simões com o contorno real, do OpenStreetMap (`campus-osm.ts`, gerado
 * por `apps/site/scripts/campus-osm.py`). Unidade: metros, com o norte para cima.
 *
 * `BLOCOS_DO_PREDIO` liga o prédio aos blocos do banco pelo slug. Bloco sem prédio aqui aparece só
 * na lista; quando os blocos oficiais forem cadastrados, é só acrescentar o slug.
 */
import { AREAS_OSM, PONTOS_LOCAIS, PREDIOS_OSM } from './campus-osm';

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
// aqui aparece só na lista (hoje, todo bloco do catálogo tem prédio).
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
  64974284: ['csau', 'fanut', 'foufal', 'eenf'], // o CSAU abriga FANUT, FOUFAL e EENF (pinos do Google Maps)
  156943706: ['iefe'], // IEFE, área `amenity=university` do OSM
  157086397: ['iqb'], // Instituto de Química e Biotecnologia, idem
  288826604: ['fau'], // FAU, idem
  202492922: ['biblioteca-central'],
  288827034: ['ru'], // Restaurante Universitário
  544426692: ['praca-de-alimentacao'],
  64963500: ['bloco-18'], // Bloco 18 - João de Deus
  64980223: ['bloco-07'], // Bloco 07 - Salas de Aula
  64963507: ['bloco-13'],
  64963326: ['ginasio'], // Ginásio da UFAL
  404593999: ['icf'],
  404593997: ['fda'],
  493988324: ['fale'],
  493988321: ['ics'],
};

/**
 * Nome e sigla de prédios que o OpenStreetMap não nomeia, pelo id do OSM (SCRUM-284). Só entra
 * aqui o que alguém que conhece o campus confirmou; o melhor lugar para corrigir é o próprio OSM,
 * que beneficia todo mundo. O script `campus-osm.py` traz o nome do OSM de volta quando existir.
 */
const NOMES_LOCAIS: Record<number, { nome: string; sigla: string }> = {
  404591641: { nome: 'Centro de Interesse Comunitário', sigla: 'CIC' }, // `description` e `ref` no OSM
  // Conferidos no Google Maps: o pino de cada unidade cai dentro (ou a poucos metros) do prédio.
  404593999: { nome: 'Instituto de Ciências Farmacêuticas', sigla: 'ICF' },
  404593997: { nome: 'Faculdade de Direito de Alagoas', sigla: 'FDA' },
  493988324: { nome: 'Faculdade de Letras', sigla: 'FALE' },
  493988321: { nome: 'Instituto de Ciências Sociais', sigla: 'ICS' },
  493988323: { nome: 'Bloco de Salas de Aula 2', sigla: 'BSA 2' },
  493988335: { nome: 'Comunicação Social - Bloco A', sigla: 'COS A' },
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
  'Instituto de Química e Biotecnologia': 'IQB',
  'Comunicação Social': 'COS B', // o Bloco A é o prédio ao lado (NOMES_LOCAIS)
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

/** Lugar que o OpenStreetMap não tem (a EDGE Academy), marcado por um ponto. */
export interface PontoLocal {
  nome: string;
  x: number;
  y: number;
}

export const PONTOS: readonly PontoLocal[] = PONTOS_LOCAIS.map(([nome, x, y]) => ({ nome, x, y }));
