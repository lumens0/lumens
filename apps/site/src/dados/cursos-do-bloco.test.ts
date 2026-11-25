import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cursosDoBloco, fraseDosCursosDaPauta } from './cursos-do-bloco';

vi.mock('./api', () => ({ buscarBlocos: vi.fn() }));
const { buscarBlocos } = await import('./api');

describe('fraseDosCursosDaPauta (SCRUM-399)', () => {
  it('categoria do campus todo é de todos, em qualquer bloco e mesmo sem saber os cursos', () => {
    expect(fraseDosCursosDaPauta('ichca', ['História'], 'infraestrutura')).toBe(
      'Pauta de infraestrutura é de todos: qualquer estudante verificado pode apoiar.',
    );
    expect(fraseDosCursosDaPauta('ichca', undefined, 'seguranca')).toBe(
      'Pauta de segurança é de todos: qualquer estudante verificado pode apoiar.',
    );
    expect(fraseDosCursosDaPauta('ichca', [], 'acessibilidade')).toContain(
      'acessibilidade é de todos',
    );
  });

  it('pauta do campus inteiro é aberta', () => {
    expect(fraseDosCursosDaPauta(null, undefined, 'ensino')).toBe(
      'Pauta do campus inteiro: qualquer estudante verificado pode apoiar.',
    );
  });

  it('bloco com cursos diz quais; sem cursos diz que é aberto; sem saber, não diz nada', () => {
    expect(fraseDosCursosDaPauta('ichca', ['História', 'Filosofia'], 'ensino')).toBe(
      'Só apoiam estudantes de: História, Filosofia.',
    );
    expect(fraseDosCursosDaPauta('ru', [], 'servicos')).toBe(
      'Aberta a qualquer estudante verificado.',
    );
    expect(fraseDosCursosDaPauta('ichca', undefined, 'ensino')).toBeNull();
  });
});

describe('cursosDoBloco (SCRUM-399)', () => {
  beforeEach(() => {
    vi.mocked(buscarBlocos).mockReset();
  });

  it('devolve os cursos do bloco pedido', async () => {
    vi.mocked(buscarBlocos).mockResolvedValue([
      { slug: 'ic', nome: 'IC', base_estudantes: 585, cursos: ['Ciência da Computação'] },
      { slug: 'ru', nome: 'RU', base_estudantes: 6000, cursos: [] },
    ]);
    expect(await cursosDoBloco('ic')).toEqual(['Ciência da Computação']);
    expect(await cursosDoBloco('ru')).toEqual([]);
  });

  it('API antiga, sem o campo cursos: não se sabe, e a página não afirma que o bloco é aberto', async () => {
    vi.mocked(buscarBlocos).mockResolvedValue([{ slug: 'ic', nome: 'IC', base_estudantes: 585 }]);
    expect(await cursosDoBloco('ic')).toBeUndefined();
  });

  it('bloco que não veio: sem resposta', async () => {
    vi.mocked(buscarBlocos).mockResolvedValue([]);
    expect(await cursosDoBloco('inexistente')).toBeUndefined();
  });

  it('API de blocos fora do ar: sem resposta e sem erro, a página não cai', async () => {
    vi.mocked(buscarBlocos).mockRejectedValue(new Error('fora do ar'));
    expect(await cursosDoBloco('ic')).toBeUndefined();
  });

  it('pauta do campus inteiro (sem bloco): nem consulta a API', async () => {
    expect(await cursosDoBloco(null)).toBeUndefined();
    expect(buscarBlocos).not.toHaveBeenCalled();
  });
});
