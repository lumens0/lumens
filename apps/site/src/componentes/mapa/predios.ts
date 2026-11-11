/**
 * Prédios do Campus A.C. Simões, com o desenho do protótipo do mapa (coordenadas tiradas do mapa da
 * DIACOM, em px de uma área de 1968 × 1103). Cada retângulo é `[x, y, largura, altura]`.
 *
 * `blocos` liga o prédio aos blocos do banco pelo slug. Bloco sem prédio aqui aparece só na lista,
 * em "Outros lugares"; quando os blocos oficiais forem cadastrados, é só acrescentar o slug.
 */
export interface Predio {
  id: number;
  nome: string;
  sigla: string;
  retangulos: readonly (readonly [number, number, number, number])[];
  blocos: readonly string[];
}

export const LARGURA_DO_CAMPUS = 1968;
export const ALTURA_DO_CAMPUS = 1103;

type Linha = [number, string, string, Predio['retangulos'], string[]?];

const LINHAS: Linha[] = [
  [1, 'Hospital Universitário', 'HU', [[310, 701, 125, 225]]],
  [2, 'Fórum', 'Fórum', [[235, 596, 40, 50]]],
  [3, 'Faculdade de Direito', 'FDA', [[340, 541, 70, 110]]],
  [4, 'Reitoria', 'Reitoria', [[485, 556, 95, 90]]],
  [5, 'Núcleo Executivo de Processos Seletivos', 'Copeve', [[500, 691, 28, 38]]],
  [6, 'Coordenadoria Institucional de Educação a Distância', 'Cied', [[588, 723, 24, 33]]],
  [7, 'Faculdade de Medicina', 'Famed', [[530, 786, 85, 115]]],
  [8, 'Biblioteca Central', 'BC', [[742, 538, 115, 54]], ['biblioteca-central']],
  [9, 'Faculdade de Biblioteconomia', 'Biblio', [[760, 635, 47, 25]]],
  [
    10,
    'Centro de Saúde (Fanut, Esenfar, Foufal)',
    'Centro de Saúde',
    [
      [689, 710, 283, 18],
      [689, 710, 18, 90],
      [812, 710, 18, 85],
      [905, 710, 18, 85],
      [950, 700, 25, 35],
      [718, 752, 62, 48],
    ],
    ['saude'],
  ],
  [11, 'Instituto de Ciências Biológicas e da Saúde', 'ICBS', [[700, 851, 130, 95]]],
  [12, 'Praça da Paz', 'Praça da Paz', [[945, 512, 50, 22]]],
  [
    13,
    'Centro de Educação',
    'Cedu',
    [
      [907, 558, 113, 27],
      [912, 590, 30, 60],
    ],
  ],
  [14, 'Instituto de Psicologia', 'IP', [[1030, 732, 62, 63]]],
  [15, 'Instituto de Matemática', 'IM', [[1052, 516, 28, 59]]],
  [
    16,
    'Faculdade de Economia, Administração e Contabilidade',
    'Feac',
    [
      [1089, 572, 68, 26],
      [1164, 580, 53, 50],
    ],
  ],
  [17, 'Faculdade de Serviço Social', 'FSSO', [[1167, 515, 27, 55]]],
  [18, 'Bloco 18 · João de Deus · Salas de Aula', 'Bloco 18', [[1232, 540, 45, 115]], ['bloco-18']],
  [
    19,
    'Faculdade de Letras',
    'Fale',
    [
      [1197, 721, 72, 45],
      [1197, 770, 55, 60],
      [1205, 835, 50, 40],
    ],
  ],
  [
    20,
    'Instituto de Ciências Humanas, Comunicação e Artes',
    'ICHCA',
    [
      [1332, 538, 115, 40],
      [1332, 578, 40, 72],
      [1395, 578, 52, 30],
    ],
    ['artes'],
  ],
  [21, 'Blocos de Salas de Aula B51 e B52', 'B51/B52', [[1322, 726, 42, 70]]],
  [
    22,
    'Residência Universitária',
    'RUA',
    [
      [1597, 521, 18, 18],
      [1630, 532, 18, 18],
      [1600, 560, 18, 18],
      [1630, 560, 18, 18],
      [1610, 598, 18, 18],
    ],
    ['residencia-universitaria'],
  ],
  [23, 'Superintendência de Infraestrutura', 'Sinfra', [[1729, 556, 30, 30]]],
  [24, 'Restaurante Universitário', 'RU', [[1574, 365, 72, 75]]],
  [25, 'Núcleo de Desenvolvimento Infantil', 'NDI', [[1222, 390, 52, 55]]],
  [26, 'Laboratório de Computação Científica e Visualização', 'LCCV', [[1269, 305, 43, 55]]],
  [
    27,
    'Centro de Tecnologia',
    'Ctec',
    [
      [1294, 80, 75, 30],
      [1294, 110, 25, 40],
      [1294, 150, 75, 25],
      [1284, 205, 40, 17],
    ],
    ['engenharias'],
  ],
  [
    28,
    'Faculdade de Arquitetura e Design',
    'FAU',
    [
      [1204, 120, 20, 90],
      [1259, 90, 25, 120],
      [1164, 200, 120, 15],
      [1154, 88, 80, 22],
    ],
  ],
  [29, 'Instituto de Química', 'IQB', [[1099, 330, 40, 120]]],
  [30, 'Comunicação Social', 'COS', [[1059, 222, 80, 40]]],
  [31, 'Bloco 13 · Salas de Aula', 'Bloco 13', [[1074, 345, 25, 33]]],
  [
    32,
    'Instituto de Física',
    'IF',
    [
      [974, 370, 25, 30],
      [1005, 345, 24, 105],
    ],
  ],
  [33, 'Instituto de Computação', 'IC', [[900, 235, 55, 30]]],
  [34, 'Instituto de Ciências Atmosféricas', 'Icat', [[884, 392, 28, 60]]],
  [35, 'Instituto de Geografia, Desenvolvimento e Meio Ambiente', 'Igdema', [[807, 340, 30, 112]]],
  [36, 'Centro de Interesse Comunitário (Edufal · Proest)', 'CIC', [[690, 295, 55, 60]]],
  [
    37,
    'Praça de Convivência (Bancos · Transpal · Correios)',
    'Praça',
    [
      [680, 370, 85, 25],
      [690, 400, 75, 35],
    ],
  ],
  [
    38,
    'Faculdade de Educação Física',
    'Ed. Física',
    [
      [535, 345, 40, 85],
      [375, 340, 40, 60],
    ],
  ],
  [
    39,
    'Complexo Esportivo',
    'Complexo Esportivo',
    [
      [290, 75, 140, 200],
      [470, 65, 130, 220],
    ],
  ],
  [40, 'Bloco de Salas de Aula 7', 'Bloco 7', [[837, 370, 50, 20]]],
  [41, 'Ampliação da Comunicação Social', 'COS 2', [[984, 235, 55, 27]]],
  [42, 'Materiais', 'Materiais', [[1054, 135, 50, 30]]],
  [
    43,
    'Centro de Pesquisa em Matemática Computacional',
    'CPMAT',
    [
      [1037, 580, 38, 38],
      [1089, 618, 48, 37],
    ],
  ],
  [44, 'Núcleo de Pesquisa Multidisciplinar', 'NPM', [[1209, 300, 30, 70]]],
  [45, 'Núcleo de Pesquisas Tecnológicas', 'NPT', [[1144, 222, 52, 40]]],
  [46, 'Prédio de Letras-Libras', 'Letras-Libras', [[1234, 881, 50, 30]]],
  [
    47,
    'Ampliação do Instituto de Ciências Sociais',
    'ICS',
    [
      [1324, 826, 30, 60],
      [1358, 856, 42, 65],
    ],
  ],
  [48, 'Biotério', 'Biotério', [[1899, 335, 50, 40]]],
];

export const PREDIOS: readonly Predio[] = LINHAS.map(([id, nome, sigla, retangulos, blocos]) => ({
  id,
  nome,
  sigla,
  retangulos,
  blocos: blocos ?? [],
}));

/** Vias do protótipo, só desenho de fundo. */
export const VIAS: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 85, 1103],
  [0, 1006, 1968, 55],
  [85, 458, 1883, 45],
  [270, 662, 1698, 28],
  [620, 270, 30, 666],
  [620, 268, 729, 27],
  [1323, 268, 26, 200],
  [1676, 90, 32, 916],
];
