import { describe, expect, it } from 'vitest';
import { abaAtual } from './Abas';

describe('aba ativa do cabeçalho', () => {
  it('a página de uma pauta fica em "Pautas", e cada seção na sua aba', () => {
    expect(abaAtual('/', '/')).toBe(true);
    expect(abaAtual('/p/bebedouros-no-bloco-18', '/')).toBe(true);
    expect(abaAtual('/mapa', '/')).toBe(false);
    expect(abaAtual('/conquistas', '/conquistas')).toBe(true);
    expect(abaAtual('/atividade', '/conquistas')).toBe(false);
    // Prefixo parecido não conta: /mapas não é /mapa.
    expect(abaAtual('/mapas', '/mapa')).toBe(false);
  });
});
