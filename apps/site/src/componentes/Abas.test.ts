import { describe, expect, it } from 'vitest';
import { abaAtual } from './Abas';

describe('aba ativa do cabeçalho', () => {
  it('o Início é só a raiz, e a página de uma pauta fica em "Pautas"', () => {
    expect(abaAtual('/', '/')).toBe(true);
    expect(abaAtual('/pautas', '/')).toBe(false);
    expect(abaAtual('/p/bebedouros-no-bloco-18', '/')).toBe(false);
    expect(abaAtual('/pautas', '/pautas')).toBe(true);
    expect(abaAtual('/p/bebedouros-no-bloco-18', '/pautas')).toBe(true);
    expect(abaAtual('/', '/pautas')).toBe(false);
    expect(abaAtual('/mapa', '/pautas')).toBe(false);
  });

  it('cada seção fica na sua aba, e prefixo parecido não conta', () => {
    expect(abaAtual('/conquistas', '/conquistas')).toBe(true);
    expect(abaAtual('/atividade', '/conquistas')).toBe(false);
    // /mapas não é /mapa, e /pautas-antigas não é /pautas.
    expect(abaAtual('/mapas', '/mapa')).toBe(false);
    expect(abaAtual('/pautas-antigas', '/pautas')).toBe(false);
  });
});
