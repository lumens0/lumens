import type { ApoioSemana } from '@lumens/contratos';
import { describe, expect, it } from 'vitest';
import { graficoSemanal } from './semanas';

const SEGUNDAS = [
  '2026-09-28',
  '2026-10-05',
  '2026-10-12',
  '2026-10-19',
  '2026-10-26',
  '2026-11-02',
  '2026-11-09',
  '2026-11-16',
];
const semanas = (apoios: number[]): ApoioSemana[] =>
  SEGUNDAS.map((semana, i) => ({ semana, apoios: apoios[i] ?? 0 }));

describe('graficoSemanal', () => {
  it('sem apoio nenhum: estado vazio, sem altura e com a frase de convite', () => {
    const grafico = graficoSemanal(semanas([]));
    expect(grafico.estado).toBe('vazio');
    expect(grafico.colunas.every((c) => c.altura === 0)).toBe(true);
    expect(grafico.resumo).toContain('Ainda não há apoios');
  });

  it('só a semana atual com apoio: primeiros apoios, sem comparar', () => {
    const grafico = graficoSemanal(semanas([0, 0, 0, 0, 0, 0, 0, 4]));
    expect(grafico.estado).toBe('so-atual');
    expect(grafico.resumo).toBe('Primeiros apoios chegando esta semana.');
  });

  it('menos de 3 semanas com apoio: poucos dados, com o total e as semanas', () => {
    const grafico = graficoSemanal(semanas([0, 0, 0, 0, 0, 3, 1, 0]));
    expect(grafico.estado).toBe('poucos');
    expect(grafico.resumo).toBe('Poucos dados ainda: 4 apoios em 2 semanas.');
  });

  it('uma semana antiga só com apoio também é "poucos dados", no singular', () => {
    expect(graficoSemanal(semanas([0, 1])).resumo).toBe('Poucos dados ainda: 1 apoio em 1 semana.');
  });

  it('caso normal: altura pelo pico, rótulos DD/MM, "agora" na última e frase do pico', () => {
    const grafico = graficoSemanal(semanas([6, 9, 7, 12, 15, 11, 18, 9]));
    expect(grafico.estado).toBe('normal');
    expect(grafico.colunas.map((c) => c.rotulo)).toEqual([
      '28/09',
      '05/10',
      '12/10',
      '19/10',
      '26/10',
      '02/11',
      '09/11',
      'agora',
    ]);
    expect(grafico.colunas[6]).toMatchObject({ apoios: 18, altura: 100, atual: false });
    expect(grafico.colunas[7]).toMatchObject({ apoios: 9, altura: 50, atual: true });
    expect(grafico.total).toBe(87);
    expect(grafico.resumo).toBe('Pico: 18 apoios na semana de 09/11. Total nas 8 semanas: 87.');
  });

  it('pico na semana atual: diz "esta semana"', () => {
    const grafico = graficoSemanal(semanas([1, 2, 3, 4, 5, 6, 7, 20]));
    expect(grafico.resumo).toContain('Pico: 20 apoios esta semana.');
  });
});
