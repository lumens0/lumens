import { describe, expect, it } from 'vitest';
import { urlDosFiltros } from './filtros';

describe('URL dos filtros', () => {
  it('combina status e bloco e remove o parâmetro limpo', () => {
    expect(urlDosFiltros('prometido', 'bloco 18')).toBe('/?status=prometido&bloco=bloco+18');
    expect(urlDosFiltros(undefined, 'bloco-18')).toBe('/?bloco=bloco-18');
    expect(urlDosFiltros('prometido')).toBe('/?status=prometido');
    expect(urlDosFiltros()).toBe('/');
  });
});
