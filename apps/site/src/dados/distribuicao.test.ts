import { describe, expect, it } from 'vitest';
import { pautasPorBloco, pautasPorCategoria, resumoDosGrupos } from './distribuicao';
import { PAUTAS_TESTE } from './pautas-teste';
import type { Pauta } from './tipos';

const base = PAUTAS_TESTE[0] as Pauta;
const pauta = (categoria: string, bloco: string | null): Pauta => ({
  ...base,
  categoria,
  bloco_slug: bloco,
  bloco_nome: bloco === null ? null : bloco.toUpperCase(),
});

describe('pautasPorCategoria', () => {
  it('conta por categoria, ordena pelo total e ignora o que não é classificado', () => {
    const grupos = pautasPorCategoria([
      pauta('seguranca', null),
      pauta('infraestrutura', null),
      pauta('infraestrutura', null),
      pauta('a_classificar', null),
    ]);
    expect(grupos.map((g) => [g.rotulo, g.total, g.largura])).toEqual([
      ['Infraestrutura', 2, 100],
      ['Segurança', 1, 50],
    ]);
  });

  it('devolve lista vazia sem pautas', () => {
    expect(pautasPorCategoria([])).toEqual([]);
    expect(resumoDosGrupos([], 'categoria')).toBe('Nenhuma pauta por categoria ainda.');
  });
});

describe('pautasPorBloco', () => {
  it('agrupa por bloco e chama de "Todo o campus" as pautas sem bloco', () => {
    const grupos = pautasPorBloco([
      pauta('ensino', 'ic'),
      pauta('ensino', 'ic'),
      pauta('ensino', null),
    ]);
    expect(grupos.map((g) => [g.rotulo, g.total])).toEqual([
      ['IC', 2],
      ['Todo o campus', 1],
    ]);
    expect(resumoDosGrupos(grupos, 'bloco')).toBe('3 pautas; mais pautas em IC (2).');
  });
});
