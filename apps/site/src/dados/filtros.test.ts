import { describe, expect, it } from 'vitest';
import { urlAntigaDosFiltros, urlDosFiltros } from './filtros';

describe('urlDosFiltros', () => {
  it('monta a URL de /pautas com os filtros que existem', () => {
    expect(urlDosFiltros('prometido', 'bloco 18')).toBe('/pautas?status=prometido&bloco=bloco+18');
    expect(urlDosFiltros(undefined, 'bloco-18')).toBe('/pautas?bloco=bloco-18');
    expect(urlDosFiltros('prometido')).toBe('/pautas?status=prometido');
    expect(urlDosFiltros()).toBe('/pautas');
  });
});

describe('urlAntigaDosFiltros', () => {
  it('leva o link antigo com filtro na raiz para /pautas, com os mesmos filtros', () => {
    expect(urlAntigaDosFiltros({ bloco: 'bloco-18', status: 'cobrando' })).toBe(
      '/pautas?status=cobrando&bloco=bloco-18',
    );
    expect(urlAntigaDosFiltros({ bloco: 'bloco-18' })).toBe('/pautas?bloco=bloco-18');
  });

  it('sem filtro, ou com filtro vazio ou repetido, a raiz continua sendo o Início', () => {
    expect(urlAntigaDosFiltros({})).toBeUndefined();
    expect(urlAntigaDosFiltros({ bloco: '', status: '' })).toBeUndefined();
    expect(urlAntigaDosFiltros({ bloco: ['a', 'b'] })).toBeUndefined();
  });
});
