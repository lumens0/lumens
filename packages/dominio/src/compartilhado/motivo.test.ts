import { describe, expect, it } from 'vitest';
import { MOTIVO_MAXIMO, motivoValido } from './motivo';

describe('motivoValido', () => {
  it('devolve o motivo sem espaços nas pontas', () => {
    expect(motivoValido('  Aparece um rosto.  ')).toBe('Aparece um rosto.');
  });

  it('recusa vazio, só espaços e quebra de linha ou outro caractere de controle', () => {
    for (const motivo of [
      '',
      '   ',
      'duas' + String.fromCharCode(10) + 'linhas',
      'a' + String.fromCharCode(9) + 'b',
    ]) {
      expect(motivoValido(motivo)).toBeUndefined();
    }
  });

  it('o teto conta caracteres, não bytes: 200 emojis passam e 201 não', () => {
    expect(motivoValido('😀'.repeat(MOTIVO_MAXIMO))).toBeDefined();
    expect(motivoValido('😀'.repeat(MOTIVO_MAXIMO + 1))).toBeUndefined();
  });
});
