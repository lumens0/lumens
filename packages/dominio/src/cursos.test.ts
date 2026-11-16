import { CURSOS } from '@lumens/db';
import { describe, expect, it } from 'vitest';
import { APELIDOS, MAX_CANDIDATOS, buscarCurso, chave } from './cursos';

describe('CURSOS: a lista oficial do campus (SCRUM-296)', () => {
  it('tem os 43 cursos presenciais do Campus A. C. Simões, sem repetição', () => {
    expect(CURSOS).toHaveLength(43);
    expect(new Set(CURSOS.map(chave)).size).toBe(CURSOS.length);
  });

  it('está em ordem alfabética (a lista do bot mostra os 9 primeiros)', () => {
    const ordenada = [...CURSOS].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    expect(CURSOS).toEqual(ordenada);
  });

  it('inclui os cursos que a homologação não conseguia escolher', () => {
    for (const curso of ['Medicina', 'Psicologia', 'Física', 'Letras - Português'] as const) {
      expect(CURSOS).toContain(curso);
    }
  });

  it('todo apelido aponta para um curso da lista', () => {
    for (const curso of Object.values(APELIDOS)) expect(CURSOS).toContain(curso);
  });
});

describe('buscarCurso', () => {
  it.each([
    ['Medicina', 'Medicina'],
    ['medicina', 'Medicina'],
    ['MEDICINA', 'Medicina'],
    ['Química Tecnológica e Industrial', 'Química Tecnológica e Industrial'],
    ['quimica tecnologica e industrial', 'Química Tecnológica e Industrial'],
    ['Letras - Português', 'Letras - Português'],
    ['letras portugues', 'Letras - Português'],
    ['faço medicina', 'Medicina'],
    ['Física', 'Física'],
  ])('nome completo: %j → %s', (texto, curso) => {
    expect(buscarCurso(texto)).toEqual({ tipo: 'um', curso });
  });

  it.each([
    ['CC', 'Ciência da Computação'],
    ['ADM', 'Administração'],
    ['Med', 'Medicina'],
    ['IA', 'Inteligência Artificial'],
    ['RP', 'Relações Públicas'],
    ['odonto', 'Odontologia'],
    ['psico', 'Psicologia'],
    ['eng civil', 'Engenharia Civil'],
    ['Eng. de Computação', 'Engenharia de Computação'],
    ['ed física', 'Educação Física'],
    ['biologia', 'Ciências Biológicas'],
    ['inglês', 'Letras - Inglês'],
  ])('sigla, apelido ou começo de palavra: %j → %s', (texto, curso) => {
    expect(buscarCurso(texto)).toEqual({ tipo: 'um', curso });
  });

  it('texto que serve para mais de um curso devolve só esses', () => {
    expect(buscarCurso('computação')).toEqual({
      tipo: 'varios',
      cursos: ['Ciência da Computação', 'Engenharia de Computação'],
    });
    const letras = buscarCurso('letras');
    expect(letras.tipo === 'varios' ? letras.cursos : []).toHaveLength(5);
    const engenharias = buscarCurso('engenharia');
    expect(engenharias.tipo === 'varios' ? engenharias.cursos : []).toHaveLength(5);
  });

  it.each([['Maria da Silva'], ['veterinária'], ['ma'], [''], ['   '], ['sistemas de informação']])(
    'não acha %j',
    (texto) => {
      expect(buscarCurso(texto)).toEqual({ tipo: 'nenhum' });
    },
  );

  it(`nunca devolve mais de ${String(MAX_CANDIDATOS)} cursos (cabem numa lista)`, () => {
    for (const texto of ['ciencias', 'eng', 'letras', 'quim', 'cie']) {
      const busca = buscarCurso(texto);
      if (busca.tipo === 'varios') expect(busca.cursos.length).toBeLessThanOrEqual(MAX_CANDIDATOS);
    }
  });

  it('todo curso da lista é achado pelo próprio nome, com e sem acento', () => {
    for (const curso of CURSOS) {
      expect(buscarCurso(curso)).toEqual({ tipo: 'um', curso });
      expect(buscarCurso(chave(curso))).toEqual({ tipo: 'um', curso });
    }
  });
});
