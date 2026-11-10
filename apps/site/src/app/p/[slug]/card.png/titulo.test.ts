import { describe, expect, it } from 'vitest';
import { fonteDoTitulo, tituloDoCard } from './titulo';

describe('título do card', () => {
  it('título de até 90 caracteres sai inteiro', () => {
    const titulo = 'a'.repeat(90);
    expect(tituloDoCard(titulo)).toBe(titulo);
  });

  it('título longo é cortado na última palavra inteira, sem pontuação antes do "…"', () => {
    const titulo = `${'palavra '.repeat(10)}fim, e mais um bom pedaço de texto`; // 80 + 35 caracteres
    expect(tituloDoCard(titulo)).toBe(`${'palavra '.repeat(10)}fim, e…`);
  });

  it('aceita outro limite (o bloco na prévia do link)', () => {
    expect(tituloDoCard('Bloco de Artes e Música', 12)).toBe('Bloco de…');
  });

  it('palavra única maior que o limite é cortada no limite', () => {
    expect(tituloDoCard('x'.repeat(120))).toBe(`${'x'.repeat(90)}…`);
  });

  it('conta acento e emoji como um caractere só', () => {
    const titulo = 'ç'.repeat(89) + '😀';
    expect(tituloDoCard(titulo)).toBe(titulo);
  });

  it('fonte grande até 50 caracteres, menor depois', () => {
    expect(fonteDoTitulo('a'.repeat(50))).toBe(84);
    expect(fonteDoTitulo('a'.repeat(51))).toBe(68);
  });
});
