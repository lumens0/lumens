import { describe, expect, it } from 'vitest';
import {
  blocosDaFolha,
  buscarNaFolha,
  resumoDaFolha,
  semAcento,
  textoDoBotaoDaFolha,
} from './folha';

const blocos = [
  { slug: 'ic', nome: 'Instituto de Computação' },
  { slug: 'saude', nome: 'Centro de Saúde' },
  { slug: 'ctec', nome: 'Centro de Tecnologia' },
  { slug: 'fale', nome: 'Faculdade de Letras' },
];
const siglas = { ic: 'IC', saude: 'CSAU', ctec: 'CTEC', fale: 'FALE' };
const pautas = [
  { status: 'cobrando', bloco_slug: 'ic' },
  { status: 'cobrando', bloco_slug: 'ic' },
  { status: 'prometido', bloco_slug: 'saude' },
] as const;

describe('blocosDaFolha', () => {
  it('põe os blocos com pauta primeiro, o de mais pautas antes, e os sem pauta por último', () => {
    const lista = blocosDaFolha(blocos, siglas, pautas, []);
    expect(lista.map((b) => [b.slug, b.pautas])).toEqual([
      ['ic', 2],
      ['saude', 1],
      ['ctec', 0],
      ['fale', 0],
    ]);
  });

  it('com etapa filtrada, conta só as pautas daquela etapa', () => {
    const lista = blocosDaFolha(blocos, siglas, pautas, ['prometido']);
    expect(lista.find((b) => b.slug === 'ic')?.pautas).toBe(0);
    expect(lista.find((b) => b.slug === 'saude')?.pautas).toBe(1);
  });
});

describe('buscarNaFolha', () => {
  const lista = blocosDaFolha(blocos, siglas, pautas, []);

  it('acha por nome ou por sigla, sem acento e sem diferenciar maiúsculas', () => {
    expect(buscarNaFolha(lista, 'SAUDE').map((b) => b.slug)).toEqual(['saude']);
    expect(buscarNaFolha(lista, 'ctec').map((b) => b.slug)).toEqual(['ctec']);
    expect(buscarNaFolha(lista, 'centro').map((b) => b.slug)).toEqual(['saude', 'ctec']);
  });

  it('texto vazio traz todos, e texto sem resultado traz nenhum', () => {
    expect(buscarNaFolha(lista, '  ')).toHaveLength(4);
    expect(buscarNaFolha(lista, 'xyz')).toEqual([]);
  });

  it('semAcento tira os acentos', () => {
    expect(semAcento('Computação')).toBe('computacao');
  });
});

describe('resumo e botão da folha', () => {
  const lista = blocosDaFolha(blocos, siglas, pautas, []);

  it('sem escolha, avisa que é preciso escolher e bloqueia o botão', () => {
    expect(resumoDaFolha([])).toBe('Escolha ao menos um bloco para filtrar.');
    expect(textoDoBotaoDaFolha(0)).toBe('Escolha um bloco para continuar');
  });

  it('com escolha, resume blocos e pautas e diz quantos blocos vai filtrar', () => {
    expect(resumoDaFolha(lista.slice(0, 2))).toBe('2 blocos escolhidos · 3 pautas');
    expect(resumoDaFolha(lista.slice(0, 1))).toBe('1 bloco escolhido · 2 pautas');
    expect(textoDoBotaoDaFolha(1)).toBe('Filtrar por 1 bloco');
    expect(textoDoBotaoDaFolha(3)).toBe('Filtrar por 3 blocos');
  });
});
