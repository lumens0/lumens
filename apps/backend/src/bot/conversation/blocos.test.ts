/**
 * SCRUM-325: digitar o rótulo que está na lista ("Todo o campus / não sei", "Bloco 18 (fictício)")
 * vale o mesmo que tocar na linha. Os outros casos de `blocoEscolhido` estão em `relato.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { CAMPUS_ROW_ID, CAMPUS_ROW_TITLE, blocoEscolhido, listaDeBlocos } from './blocos';

const BLOCOS = [
  { id: 'b1', slug: 'bloco-1', nome: 'Bloco 1' },
  { id: 'b18', slug: 'bloco-18', nome: 'Bloco 18 (fictício)' },
  { id: 'saude', slug: 'bloco-da-saude', nome: 'Bloco da Saúde (fictício)' },
  { id: 'bib', slug: 'biblioteca-central', nome: 'Biblioteca Central' },
];

describe('blocoEscolhido com o rótulo digitado (SCRUM-325)', () => {
  it.each([
    'Todo o campus / não sei',
    'todo o campus / nao sei',
    'TODO O CAMPUS NÃO SEI',
    'Todo o campus/não sei.',
  ])('"%s" é o campus inteiro', (digitado) => {
    expect(blocoEscolhido(digitado, BLOCOS)).toEqual({ blocoId: null });
  });

  it('o rótulo da linha do campus é o mesmo que a lista mostra', () => {
    const linha = listaDeBlocos(BLOCOS).linhas.find((l) => l.id === CAMPUS_ROW_ID);
    expect(linha?.titulo).toBe(CAMPUS_ROW_TITLE);
  });

  it('cada rótulo da lista, digitado como está, escolhe a própria linha', () => {
    for (const linha of listaDeBlocos(BLOCOS).linhas) {
      const esperado = linha.id === CAMPUS_ROW_ID ? null : linha.id.slice('bloco:'.length);
      expect(blocoEscolhido(linha.titulo, BLOCOS), linha.titulo).toEqual({ blocoId: esperado });
    }
  });

  it.each([
    ['Bloco 18 (fictício)', 'b18'],
    ['Biblioteca Central', 'bib'],
    ['saúde', 'saude'],
    ['bloco-1', 'b1'],
    ['bloco:bib', 'bib'],
    [CAMPUS_ROW_ID, null],
  ])('os casos de antes continuam: %j → %s', (digitado, esperado) => {
    expect(blocoEscolhido(digitado, BLOCOS)).toEqual({ blocoId: esperado });
  });
});
