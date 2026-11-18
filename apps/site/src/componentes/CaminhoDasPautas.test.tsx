import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PAUTAS_TESTE } from '../dados/pautas-teste';
import { CaminhoDasPautas } from './CaminhoDasPautas';

describe('CaminhoDasPautas', () => {
  const html = renderToStaticMarkup(<CaminhoDasPautas pautas={PAUTAS_TESTE} />);

  it('mostra o rótulo e o número de cada etapa em texto', () => {
    for (const rotulo of [
      'Juntando apoios',
      'Meta batida',
      'Cobrando',
      'Prometido',
      'Conquistada',
    ]) {
      expect(html).toContain(rotulo);
    }
    expect(html).toContain('Caminho das pautas');
  });

  it('esconde as barras do leitor de tela, que recebe o resumo em texto', () => {
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/pautas? no caminho/);
  });
});
