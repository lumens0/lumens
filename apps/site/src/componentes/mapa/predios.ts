/**
 * Prédios do Campus A. C. Simões com o contorno real, do OpenStreetMap (`campus-osm.ts`, gerado
 * por `apps/site/scripts/campus-osm.py`). Unidade: metros, com o norte para cima.
 *
 * `BLOCOS_DO_PREDIO` liga o prédio aos blocos do banco pelo slug. Bloco sem prédio aqui aparece só
 * na lista; quando os blocos oficiais forem cadastrados, é só acrescentar o slug.
 */
import { PREDIOS_OSM } from './campus-osm';

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

const BLOCOS_DO_PREDIO: Record<number, readonly string[]> = {
  64963500: ['bloco-18'], // Bloco 18 - João de Deus
  202492922: ['biblioteca-central'],
  64974284: ['saude'], // Centro de Ciências da Saúde - CSAU
  288826603: ['engenharias'], // Novo CTEC
  64963499: ['artes'], // ICHCA
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
};

/** "Bloco 18 - João de Deus" vira "Bloco 18"; "Centro de Ciências da Saúde - CSAU" vira "CSAU". */
export function siglaDe(nome: string): string {
  const sigla = SIGLAS[nome];
  if (sigla) return sigla;
  const [antes, depois] = nome.split(' - ');
  if (depois === undefined || antes === undefined) return nome;
  return antes.length <= depois.length ? antes : depois;
}

export const PREDIOS: readonly Predio[] = PREDIOS_OSM.map(([id, nome, d, caixa]) => ({
  id,
  nome: nome || 'Prédio sem nome no mapa',
  sigla: nome ? siglaDe(nome) : '',
  d,
  caixa,
  blocos: BLOCOS_DO_PREDIO[id] ?? [],
}));
