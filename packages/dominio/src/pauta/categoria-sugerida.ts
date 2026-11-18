/**
 * Sugestão de categoria por palavras-chave (SCRUM-365). Roda no servidor, sobre o texto que o
 * estudante já escreveu: nenhum texto sai do sistema, sem serviço externo nem IA.
 *
 * A sugestão nunca classifica sozinha: o bot pergunta e o estudante confirma ou escolhe outra.
 * Só sugere quando uma categoria vence com clareza; empate ou nenhuma palavra reconhecida não
 * sugere nada, e o bot mostra a lista inteira (SCRUM-357).
 */
import type { Categoria } from '@lumens/contratos';
import { palavrasDe } from './pautas-parecidas';

/**
 * Palavras de cada categoria, sem acento e em minúsculas (o texto é normalizado antes de comparar).
 * Termo com mais de uma palavra ("ar condicionado") só vale inteiro. Palavra que serve a duas
 * categorias ("iluminacao") entra nas duas: sozinha, empata e o estudante escolhe na lista.
 */
export const PALAVRAS_DA_CATEGORIA: Record<Categoria, readonly string[]> = {
  infraestrutura: [
    'bebedouro',
    'goteira',
    'vazamento',
    'infiltracao',
    'telhado',
    'banheiro',
    'privada',
    'vaso',
    'torneira',
    'cano',
    'encanamento',
    'ventilador',
    'ar condicionado',
    'lampada',
    'iluminacao',
    'tomada',
    'fiacao',
    'porta',
    'janela',
    'fechadura',
    'parede',
    'rachadura',
    'buraco',
    'calcada',
    'estacionamento',
    'cadeira',
    'carteira',
    'mesa',
    'lousa',
    'piso',
    'forro',
    'mofo',
    'ralo',
    'esgoto',
    'lixeira',
  ],
  servicos: [
    'restaurante',
    'cantina',
    'refeitorio',
    'bandejao',
    'comida',
    'almoco',
    'janta',
    'lanche',
    'cafe',
    'xerox',
    'copiadora',
    'biblioteca',
    'acervo',
    'secretaria',
    'onibus',
    'transporte',
    'circular',
    'atendimento',
    'fila',
  ],
  seguranca: [
    'assalto',
    'roubo',
    'roubaram',
    'furto',
    'furtaram',
    'seguranca',
    'vigilante',
    'vigilancia',
    'camera',
    'escuro',
    'iluminacao',
    'medo',
    'assedio',
    'violencia',
    'briga',
    'portaria',
    'ronda',
    'alarme',
    'incendio',
    'extintor',
  ],
  permanencia: [
    'bolsa',
    'auxilio',
    'moradia',
    'alojamento',
    'residencia',
    'creche',
    'evasao',
    'permanencia',
    'psicologo',
    'psicologa',
    'saude mental',
    'acolhimento',
    'assistencia estudantil',
    'desistir',
    'trancar',
  ],
  acessibilidade: [
    'rampa',
    'elevador',
    'cadeirante',
    'cadeira de rodas',
    'acessibilidade',
    'acessivel',
    'deficiente',
    'deficiencia',
    'libras',
    'interprete',
    'piso tatil',
    'braile',
    'surdo',
    'cego',
    'pcd',
    'corrimao',
    'banheiro adaptado',
  ],
  tecnologia: [
    'wifi',
    'wi fi',
    'internet',
    'rede',
    'sistema',
    'computador',
    'notebook',
    'projetor',
    'impressora',
    'sigaa',
    'moodle',
    'portal',
    'aplicativo',
    'app',
    'site',
    'software',
    'servidor',
    'login',
    'senha',
    'laboratorio de informatica',
  ],
  ensino: [
    'professor',
    'professora',
    'aula',
    'disciplina',
    'ementa',
    'prova',
    'avaliacao',
    'nota',
    'horario',
    'grade',
    'turma',
    'curso',
    'coordenacao',
    'monitoria',
    'estagio',
    'tcc',
    'orientador',
    'semestre',
    'conteudo',
  ],
};

/** Menor número de trocas, entradas ou saídas de letra para chegar de `a` a `b`. */
function distancia(a: string, b: string): number {
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(
        (anterior[j] ?? 0) + 1,
        (atual[j - 1] ?? 0) + 1,
        (anterior[j - 1] ?? 0) + custo,
      );
    }
    anterior = atual;
  }
  return anterior[b.length] ?? 0;
}

/** Palavras curtas só valem exatas ("rede", "app"); as longas aceitam uma letra errada. */
const TAMANHO_MINIMO_PARA_ERRO = 6;

function aparece(termo: string, palavras: readonly string[], texto: string): boolean {
  if (termo.includes(' ')) return texto.includes(` ${termo} `);
  const tolera = termo.length >= TAMANHO_MINIMO_PARA_ERRO;
  return palavras.some((palavra) => {
    // "bebedouros", "lampadas": o plural vale como o singular.
    const singular = palavra.replace(/e?s$/, '');
    if (palavra === termo || singular === termo || `${singular}s` === termo) return true;
    return (
      tolera && palavra.length >= TAMANHO_MINIMO_PARA_ERRO - 1 && distancia(palavra, termo) <= 1
    );
  });
}

/** Quantas palavras de cada categoria aparecem no texto (cada palavra conta uma vez). */
export function pontuarCategorias(texto: string): Record<Categoria, number> {
  const palavras = palavrasDe(texto);
  const normalizado = ` ${palavras.join(' ')} `;
  const pontos = {} as Record<Categoria, number>;
  for (const [categoria, termos] of Object.entries(PALAVRAS_DA_CATEGORIA) as [
    Categoria,
    readonly string[],
  ][]) {
    pontos[categoria] = termos.filter((termo) => aparece(termo, palavras, normalizado)).length;
  }
  return pontos;
}

/**
 * A categoria que o texto sugere, só quando uma vence com clareza: mais palavras que qualquer
 * outra. Empate ou nenhuma palavra reconhecida dá `undefined`.
 */
export function sugerirCategoria(texto: string): Categoria | undefined {
  const ordenadas = (Object.entries(pontuarCategorias(texto)) as [Categoria, number][]).sort(
    (a, b) => b[1] - a[1],
  );
  const [primeira, segunda] = ordenadas;
  if (!primeira || primeira[1] === 0) return undefined;
  if (segunda && segunda[1] === primeira[1]) return undefined;
  return primeira[0];
}
