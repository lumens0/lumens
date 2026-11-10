import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Inicio } from './inicio';

describe('início do painel de curadoria', () => {
  it('mostra quem entrou e o botão de sair', () => {
    const html = renderToStaticMarkup(<Inicio nome="Ana" sair={() => Promise.resolve()} />);

    expect(html).toContain('Painel de curadoria');
    expect(html).toContain('Você entrou como Ana.');
    expect(html).toContain('Sair');
  });
});
