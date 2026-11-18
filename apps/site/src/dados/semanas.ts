import type { ApoioSemana } from '@lumens/contratos';

export interface ColunaDaSemana {
  /** Segunda-feira da semana, `DD/MM`; a semana atual é "agora". */
  rotulo: string;
  /** Segunda-feira da semana como veio da API, `AAAA-MM-DD`. */
  semana: string;
  apoios: number;
  /** Altura da barra, de 0 a 100, em relação à semana com mais apoios. */
  altura: number;
  atual: boolean;
}

/**
 * Como o gráfico se comporta (SCRUM-359):
 * - `vazio`: nenhum apoio nas 8 semanas, sem barras;
 * - `so-atual`: só a semana atual tem apoio;
 * - `poucos`: menos de 3 semanas com apoio;
 * - `normal`: o resto.
 */
export type EstadoDoGrafico = 'vazio' | 'so-atual' | 'poucos' | 'normal';

export interface GraficoSemanal {
  colunas: ColunaDaSemana[];
  total: number;
  estado: EstadoDoGrafico;
  /** Frase para baixo do gráfico e para o leitor de tela. */
  resumo: string;
}

const diaEMes = (semana: string): string => `${semana.slice(8, 10)}/${semana.slice(5, 7)}`;

/**
 * Transforma as semanas da API (da mais antiga à atual, as vazias com zero) no que o gráfico
 * desenha. A semana atual é a última e ainda está incompleta, por isso ganha o rótulo "agora".
 */
export function graficoSemanal(itens: readonly ApoioSemana[]): GraficoSemanal {
  const maior = Math.max(0, ...itens.map((item) => item.apoios));
  const colunas = itens.map((item, i) => ({
    rotulo: i === itens.length - 1 ? 'agora' : diaEMes(item.semana),
    semana: item.semana,
    apoios: item.apoios,
    altura: maior === 0 ? 0 : Math.round((item.apoios / maior) * 100),
    atual: i === itens.length - 1,
  }));
  const total = itens.reduce((soma, item) => soma + item.apoios, 0);
  const comApoio = colunas.filter((coluna) => coluna.apoios > 0);
  const pico = colunas.find((coluna) => coluna.apoios === maior);

  if (total === 0) {
    return {
      colunas,
      total,
      estado: 'vazio',
      resumo:
        'Ainda não há apoios neste período. Quando alguém apoiar uma pauta, o gráfico aparece aqui.',
    };
  }
  if (comApoio.length === 1 && comApoio[0]?.atual) {
    return { colunas, total, estado: 'so-atual', resumo: 'Primeiros apoios chegando esta semana.' };
  }
  if (comApoio.length < 3) {
    return {
      colunas,
      total,
      estado: 'poucos',
      resumo: `Poucos dados ainda: ${String(total)} ${total === 1 ? 'apoio' : 'apoios'} em ${String(comApoio.length)} ${comApoio.length === 1 ? 'semana' : 'semanas'}.`,
    };
  }
  const semanaDoPico = pico?.atual ? 'esta semana' : `na semana de ${pico?.rotulo ?? ''}`;
  return {
    colunas,
    total,
    estado: 'normal',
    resumo: `Pico: ${String(maior)} apoios ${semanaDoPico}. Total nas ${String(colunas.length)} semanas: ${String(total)}.`,
  };
}
