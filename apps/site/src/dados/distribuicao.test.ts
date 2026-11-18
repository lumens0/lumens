import { describe, expect, it } from 'vitest';
import { apoiosPorCategoria, blocosMaisAtivos, resumoDosGrupos } from './distribuicao';
import { PAUTAS_TESTE } from './pautas-teste';
import type { Pauta } from './tipos';

const base = PAUTAS_TESTE[0] as Pauta;
const pauta = (categoria: string, bloco: string | null, apoios: number): Pauta => ({
  ...base,
  categoria,
  apoios,
  bloco_slug: bloco,
  bloco_nome: bloco === null ? null : bloco.toUpperCase(),
});

describe('apoiosPorCategoria', () => {
  it('soma os apoios por categoria, ordena pelo total e ignora o que não é classificado', () => {
    const grupos = apoiosPorCategoria([
      pauta('seguranca', null, 5),
      pauta('infraestrutura', null, 3),
      pauta('infraestrutura', null, 7),
      pauta('a_classificar', null, 99),
    ]);
    expect(grupos.map((g) => [g.rotulo, g.total, g.largura])).toEqual([
      ['Infraestrutura', 10, 100],
      ['Segurança', 5, 50],
    ]);
  });

  it('devolve lista vazia sem pautas', () => {
    expect(apoiosPorCategoria([])).toEqual([]);
    expect(resumoDosGrupos([], 'Sem apoios.')).toBe('Sem apoios.');
  });
});

describe('blocosMaisAtivos', () => {
  it('soma por bloco, deixa de fora as pautas do campus e limita à quantidade pedida', () => {
    const pautas = [
      pauta('ensino', 'ic', 4),
      pauta('ensino', 'ic', 4),
      pauta('ensino', 'ru', 9),
      pauta('ensino', 'cc', 1),
      pauta('ensino', null, 50),
    ];
    expect(blocosMaisAtivos(pautas, 2).map((g) => [g.rotulo, g.total])).toEqual([
      ['RU', 9],
      ['IC', 8],
    ]);
    expect(resumoDosGrupos(blocosMaisAtivos(pautas), 'x')).toBe('18 apoios; o maior é RU (9).');
  });
});
