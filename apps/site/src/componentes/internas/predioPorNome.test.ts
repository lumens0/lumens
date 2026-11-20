import { describe, expect, it } from 'vitest';
import { predioDoBloco } from './predioPorNome';

describe('predioDoBloco', () => {
  it('acha pelo slug direto do bloco', () => {
    expect(predioDoBloco('bloco-18')?.id).toBe(64963500);
    expect(predioDoBloco('engenharias')?.id).toBe(288826603);
    expect(predioDoBloco('ic')?.id).toBe(202492816);
  });

  it('acha pelo nome quando não há slug (conquistas e atividade)', () => {
    expect(predioDoBloco(null, 'Bloco das Engenharias (fictício)')?.id).toBe(288826603);
    expect(predioDoBloco(null, 'Biblioteca Central')?.id).toBe(202492922);
    expect(predioDoBloco(null, 'IC - Instituto de Computação')?.id).toBe(202492816);
    expect(predioDoBloco(null, 'Bebedouros funcionando no Bloco 18')?.id).toBe(64963500);
  });

  it('retorna undefined sem bloco ou para o campus inteiro', () => {
    expect(predioDoBloco(null, null)).toBeUndefined();
    expect(predioDoBloco(null, 'Todo o campus')).toBeUndefined();
  });
});
