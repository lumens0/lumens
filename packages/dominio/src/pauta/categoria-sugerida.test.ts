import { CATEGORIAS } from '@lumens/contratos';
import { describe, expect, it } from 'vitest';
import { PALAVRAS_DA_CATEGORIA, pontuarCategorias, sugerirCategoria } from './categoria-sugerida';

describe('PALAVRAS_DA_CATEGORIA', () => {
  it('tem palavras para cada categoria oficial, e só para elas', () => {
    expect(Object.keys(PALAVRAS_DA_CATEGORIA).sort()).toEqual(Object.keys(CATEGORIAS).sort());
  });

  it('guarda as palavras sem acento, em minúsculas e sem pontuação', () => {
    for (const termos of Object.values(PALAVRAS_DA_CATEGORIA)) {
      for (const termo of termos) expect(termo).toMatch(/^[a-z0-9]+( [a-z0-9]+)*$/);
    }
  });

  // Cada palavra de cada categoria sugere a sua categoria, sozinha, ou empata de propósito com
  // outra (as de fronteira, que mandam o estudante para a lista).
  it.each(Object.entries(PALAVRAS_DA_CATEGORIA).flatMap(([c, ts]) => ts.map((t) => [c, t])))(
    '%s: "%s" pontua na própria categoria',
    (categoria, termo) => {
      const pontos = pontuarCategorias(`o problema é ${termo} aqui`);
      expect(pontos[categoria as keyof typeof pontos]).toBeGreaterThanOrEqual(1);
    },
  );
});

describe('sugerirCategoria', () => {
  it.each([
    ['O bebedouro do bloco 18 está quebrado', 'infraestrutura'],
    ['tem uma goteira enorme na sala', 'infraestrutura'],
    ['bebedoro quebrado', 'infraestrutura'],
    ['as lâmpadas do corredor queimaram', 'infraestrutura'],
    ['a fila do RU tá gigante no almoço', 'servicos'],
    ['xerox da biblioteca sem papel', 'servicos'],
    ['assaltaram um colega no estacionamento, queremos mais vigilante e camera', 'seguranca'],
    ['roubaram minha mochila, o local é escuro e dá medo', 'seguranca'],
    ['não tem rampa nem elevador pra cadeirante', 'acessibilidade'],
    ['precisamos de interprete de libras', 'acessibilidade'],
    ['o wifi não pega nada', 'tecnologia'],
    ['o sigaa caiu de novo', 'tecnologia'],
    ['internet horrivel no lab', 'tecnologia'],
    ['o professor muda a data da prova toda semana', 'ensino'],
    ['a ementa da disciplina esta desatualizada', 'ensino'],
    ['atraso no pagamento da bolsa e do auxilio moradia', 'permanencia'],
    ['sem creche pra quem tem filho', 'permanencia'],
    ['VAZAMENTO NO BANHEIRO!!!', 'infraestrutura'],
  ] as const)('texto com termo claro: "%s" → %s', (texto, categoria) => {
    expect(sugerirCategoria(texto)).toBe(categoria);
  });

  it('aceita plural, erro de digitação e gíria sem acento', () => {
    expect(sugerirCategoria('bebedouros quebrados')).toBe('infraestrutura');
    expect(sugerirCategoria('o vazamneto no cano')).toBe('infraestrutura');
    expect(sugerirCategoria('gotera ta caindo')).toBe('infraestrutura');
    expect(sugerirCategoria('o wi-fi caiu')).toBe('tecnologia');
    expect(sugerirCategoria('wifi da sala nao funciona')).toBe('tecnologia');
  });

  it('o plural não conta em dobro: "aula" e "aulas" são uma palavra só', () => {
    expect(pontuarCategorias('aulas').ensino).toBe(1);
    expect(sugerirCategoria('goteira na sala de aula')).toBeUndefined();
  });

  it('casos de fronteira empatam e não sugerem nada', () => {
    expect(sugerirCategoria('Wi-Fi da biblioteca')).toBeUndefined();
    expect(sugerirCategoria('iluminação')).toBeUndefined();
    expect(sugerirCategoria('banheiro adaptado')).toBeUndefined();
  });

  it('texto sem termo conhecido não sugere nada', () => {
    expect(sugerirCategoria('')).toBeUndefined();
    expect(sugerirCategoria('preciso de ajuda')).toBeUndefined();
    expect(sugerirCategoria('Problema esquisito')).toBeUndefined();
  });

  it('só vale palavra inteira: "carteirinha" não é "carteira"', () => {
    expect(sugerirCategoria('minha carteirinha')).toBeUndefined();
    expect(sugerirCategoria('o apparelho')).toBeUndefined();
  });

  it('vence a categoria com mais palavras', () => {
    // infraestrutura (banheiro) x seguranca (escuro, medo): 1 a 2.
    expect(sugerirCategoria('banheiro escuro, dá medo')).toBe('seguranca');
  });
});
