import { describe, expect, it } from 'vitest';
import { caminhoDasPautas, resumoDoCaminho } from './caminho';
import { PAUTAS_TESTE } from './pautas-teste';
import type { Pauta } from './tipos';

const com = (status: Pauta['status'], quantas: number): Pauta[] =>
  Array.from({ length: quantas }, (_, i) => ({
    ...(PAUTAS_TESTE[0] as Pauta),
    slug: `${status}-${String(i)}`,
    status,
  }));

describe('caminhoDasPautas', () => {
  it('lista as sete etapas públicas na ordem do caminho, com zero nas vazias', () => {
    const etapas = caminhoDasPautas([]);
    expect(etapas.map((e) => e.status)).toEqual([
      'juntando_apoios',
      'meta_batida',
      'cobrando',
      'prometido',
      'entregue_em_parte',
      'descumprida',
      'conquistada',
    ]);
    expect(etapas.every((e) => e.total === 0 && e.largura === 0)).toBe(true);
  });

  it('conta por status e dimensiona as barras pela etapa maior', () => {
    const etapas = caminhoDasPautas([
      ...com('juntando_apoios', 4),
      ...com('cobrando', 2),
      ...com('conquistada', 1),
    ]);
    const por = Object.fromEntries(etapas.map((e) => [e.status, e]));
    expect(por.juntando_apoios).toMatchObject({ total: 4, largura: 100 });
    expect(por.cobrando).toMatchObject({ total: 2, largura: 50 });
    expect(por.conquistada).toMatchObject({ total: 1, largura: 25 });
    expect(por.prometido).toMatchObject({ total: 0, largura: 0 });
  });

  it('ignora pautas fora da lista pública', () => {
    const etapas = caminhoDasPautas([...com('em_curadoria', 3), ...com('recusada', 2)]);
    expect(etapas.reduce((soma, e) => soma + e.total, 0)).toBe(0);
  });
});

describe('resumoDoCaminho', () => {
  it('diz que não há pautas quando o caminho está vazio', () => {
    expect(resumoDoCaminho(caminhoDasPautas([]))).toBe('Nenhuma pauta no caminho ainda.');
  });

  it('usa o singular com uma pauta', () => {
    expect(resumoDoCaminho(caminhoDasPautas(com('cobrando', 1)))).toContain('1 pauta no caminho');
  });
});
