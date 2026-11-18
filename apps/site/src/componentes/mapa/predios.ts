/**
 * Prédios do Campus A. C. Simões com o contorno real, do OpenStreetMap (`campus-osm.ts`, gerado
 * por `apps/site/scripts/campus-osm.py`). Unidade: metros, com o norte para cima.
 *
 * `BLOCOS_DO_PREDIO` liga o prédio aos blocos do banco pelo slug. Bloco sem prédio aqui aparece só
 * na lista; quando os blocos oficiais forem cadastrados, é só acrescentar o slug.
 */
import { AREAS_OSM, PONTOS_LOCAIS, PREDIOS_OSM } from './campus-osm';
import { pontoDoNome } from './nomes';

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
  /** Ponto do nome: na borda de baixo da parte mais larga do prédio (`pontoDoNome`). */
  rotulo: readonly [number, number];
  blocos: readonly string[];
}

// Slugs do catálogo real de blocos (`packages/db/seed/blocos-ufal.ts`, SCRUM-292) e, como apelido, os
// do seed de desenvolvimento (`engenharias`, `artes`, `saude`), que seguem valendo enquanto o catálogo
// real não estiver no banco (o marcador casa por igualdade de slug). Bloco sem prédio
// aqui aparece só na lista (hoje, todo bloco do catálogo tem prédio).
const BLOCOS_DO_PREDIO: Record<number, readonly string[]> = {
  202492816: ['ic'], // IC - Instituto de Computação
  157086398: ['im'], // IM (Bloco 12); o OSM o chama de "IC e IM"
  64975419: ['if'], // Instituto de Física
  1338403227: ['icbs'],
  259323643: ['famed'],
  288826603: ['ctec', 'engenharias'], // Novo CTEC; `engenharias` é o slug do seed de desenvolvimento
  326103196: ['feac'],
  64963102: ['fsso'],
  64963499: ['ichca', 'artes'], // `artes` é o slug do seed de desenvolvimento
  64963258: ['icat'], // Instituto de Meteorologia
  64962904: ['igdema'],
  493988328: ['ip'],
  64974358: ['cedu'],
  64974284: ['csau', 'saude', 'fanut', 'foufal'], // CSAU abriga FANUT e FOUFAL; `saude` é do seed
  156943706: ['iefe'], // IEFE, área `amenity=university` do OSM
  157086397: ['iqb'], // Instituto de Química e Biotecnologia, idem
  288826604: ['fau'], // FAU, idem
  202492922: ['biblioteca-central'],
  288827034: ['ru'], // Restaurante Universitário
  64963500: ['bloco-18'], // Bloco 18 - João de Deus
  64980223: ['bloco-07'], // Bloco 07 - Salas de Aula
  64963507: ['bloco-13'],
  64963326: ['ginasio'], // Ginásio da UFAL
  404593999: ['icf'],
  404594001: ['eenf'], // no Google Maps a EENF fica no prédio ao norte da FANUT, junto do ICF
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
  404594001: { nome: 'Escola de Enfermagem', sigla: 'EENF' },
  404593997: { nome: 'Faculdade de Direito de Alagoas', sigla: 'FDA' },
  493988324: { nome: 'Faculdade de Letras', sigla: 'FALE' },
  493988321: { nome: 'Instituto de Ciências Sociais', sigla: 'ICS' },
  493988323: { nome: 'Bloco de Salas de Aula 2', sigla: 'BSA 2' },
  493988335: { nome: 'Comunicação Social - Bloco A', sigla: 'COS A' },
  466361733: { nome: 'Colégio de Aplicação Telma Vitória', sigla: 'CAp' }, // pino a 3 m, dentro do prédio
  263722474: { nome: 'Farmácia Escola', sigla: 'Farmácia Escola' }, // pino dentro do prédio
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
  'Instituto de Computação e Instituto de Matemática': 'IM (Bloco 12)',
  // O outro prédio de Matemática, que o povo chama de "IM novo"; o bloco `im` é o do Bloco 12.
  'Instituto de Matemática': 'IM novo',
  'Instituto de Física': 'IF',
  'Centro de Educação': 'CEDU',
  'Polo Maceió EAD': 'EAD',
  'Centro de Pesquisa de Tecnologia Digitais para Educação (CPTEC)': 'CPTEC',
  'Posto de Meteorologia': 'Posto meteorológico',
  'Instituto de Química e Biotecnologia': 'IQB',
  'Comunicação Social': 'COS B', // o Bloco A é o prédio ao lado (NOMES_LOCAIS)
  'Bloco 06 - IGDEMA': 'Bloco 06',
  'Ginásio da UFAL': 'Ginásio',
};

/** Nome mostrado no painel quando o do OSM engana: o prédio dos dois institutos é o IM, Bloco 12. */
const NOMES_EXIBIDOS: Record<string, string> = {
  'Instituto de Computação e Instituto de Matemática': 'Instituto de Matemática (Bloco 12)',
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

const SEM_ROTULO = new Set(['Praça de Alimentação UFAL']);

export const PREDIOS: readonly Predio[] = PREDIOS_OSM.map(([id, nomeOsm, d, caixa, curto]) => {
  const local = NOMES_LOCAIS[id];
  const nome = NOMES_EXIBIDOS[nomeOsm] ?? (nomeOsm || local?.nome || '');
  // A sigla do OSM (`short_name`, `ref`) vale quando tem 3 letras ou mais: "13" não diz nada.
  const sigla = nomeOsm
    ? (SIGLAS[nomeOsm] ?? (curto.length >= 3 ? curto : siglaDe(nomeOsm)))
    : (local?.sigla ?? curto);
  return {
    id,
    nome: nome || 'Prédio sem nome no mapa',
    // A praça ao lado do IQB não é bloco nem nome que os estudantes usem: fica desenhada, sem rótulo.
    sigla: nome && !SEM_ROTULO.has(nome) ? sigla || siglaDe(nome) : '',
    d,
    caixa,
    rotulo: pontoDoNome(d, caixa),
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

// Área que repete o nome de um prédio (a Praça de Alimentação é parque e prédio no OSM) fica sem rótulo.
const NOMES_DE_PREDIO = new Set(PREDIOS_OSM.map(([, nome]) => nome));

/** Nomes que o OSM não tem, dados por quem conhece o campus: o campo ao lado da EDGE Academy. */
export const ID_DO_ESTADIO = 288827033;
const NOMES_EXTRAS = new Map([[ID_DO_ESTADIO, 'Estádio da UFAL']]);

export const AREAS: readonly Area[] = AREAS_OSM.map(([id, tipo, nome, d, caixa]) => ({
  id,
  tipo: tipo as TipoDeArea,
  nome: NOMES_EXTRAS.get(id) ?? (NOMES_DE_PREDIO.has(nome) ? '' : nome),
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
