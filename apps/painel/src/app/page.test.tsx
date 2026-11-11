import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Inicio } from './inicio';
import { Moldura } from './moldura';

describe('início do painel de curadoria', () => {
  it('mostra quem entrou, o que espera decisão e o botão de sair', () => {
    const html = renderToStaticMarkup(
      <Moldura nome="Ana" sair={() => Promise.resolve()}>
        <Inicio nome="Ana" pautasNaFila={3} relatosPendentes={2} />
      </Moldura>,
    );

    expect(html).toContain('Painel de curadoria');
    expect(html).toContain('Você entrou como Ana.');
    expect(html).toContain('3 pautas esperando decisão.');
    expect(html).toContain('2 relatos esperando moderação.');
    expect(html).toContain('href="/fila"');
    expect(html).toContain('href="/relatos"');
    expect(html).toContain('Sair');
  });

  it.each([
    [0, 'Nenhuma pauta esperando decisão.', 'Nenhum relato esperando moderação.'],
    [1, '1 pauta esperando decisão.', '1 relato esperando moderação.'],
  ])('%i na fila: %s', (n, pautas, relatos) => {
    const html = renderToStaticMarkup(<Inicio nome="Ana" pautasNaFila={n} relatosPendentes={n} />);
    expect(html).toContain(pautas);
    expect(html).toContain(relatos);
  });
});
