import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Inicio } from './inicio';
import { Moldura } from './moldura';

describe('início do painel de curadoria', () => {
  it('mostra quem entrou, o que espera decisão e o botão de sair', () => {
    const html = renderToStaticMarkup(
      <Moldura nome="Ana" sair={() => Promise.resolve()}>
        <Inicio nome="Ana" pautasNaFila={3} />
      </Moldura>,
    );

    expect(html).toContain('Painel de curadoria');
    expect(html).toContain('Você entrou como Ana.');
    expect(html).toContain('3 pautas esperando decisão.');
    expect(html).toContain('href="/fila"');
    expect(html).toContain('Sair');
  });

  it.each([
    [0, 'Nenhuma pauta esperando decisão.'],
    [1, '1 pauta esperando decisão.'],
  ])('%i na fila: %s', (n, texto) => {
    expect(renderToStaticMarkup(<Inicio nome="Ana" pautasNaFila={n} />)).toContain(texto);
  });
});
