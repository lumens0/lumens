import { describe, expect, it } from 'vitest';
import { CATEGORIAS, ehCategoria, rotuloDaCategoria } from './index';

describe('rotuloDaCategoria', () => {
  it.each(Object.entries(CATEGORIAS))('%s mostra "%s"', (chave, rotulo) => {
    expect(rotuloDaCategoria(chave)).toBe(rotulo);
  });

  it('ignora espaços nas pontas do valor', () => {
    expect(rotuloDaCategoria(' seguranca ')).toBe('Segurança');
  });

  it('a_classificar e valor fora da lista não têm rótulo', () => {
    expect(rotuloDaCategoria('a_classificar')).toBeUndefined();
    expect(rotuloDaCategoria('Infraestrutura')).toBeUndefined();
    expect(rotuloDaCategoria('qualquer')).toBeUndefined();
  });
});

describe('ehCategoria', () => {
  it('aceita as chaves da lista', () => {
    expect(ehCategoria('seguranca')).toBe(true);
  });

  it.each(['a_classificar', 'desconhecida', 'toString', '__proto__', 'constructor'])(
    'recusa %s',
    (valor) => {
      expect(ehCategoria(valor)).toBe(false);
      expect(rotuloDaCategoria(valor)).toBeUndefined();
    },
  );
});
