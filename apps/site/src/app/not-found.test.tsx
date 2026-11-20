import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PaginaNaoEncontrada, { metadata } from './not-found';
import PautaNaoEncontrada from './p/[slug]/not-found';

/** SCRUM-380: a 404 fala português, tem título próprio e um h1. */
describe('páginas não encontradas', () => {
  it('a 404 geral tem h1, texto em português e volta às pautas', () => {
    const html = renderToStaticMarkup(<PaginaNaoEncontrada />);
    expect(html).toMatch(/<h1[^>]*>Não encontramos essa página<\/h1>/);
    expect(html).toContain('href="/pautas"');
    expect(html).not.toContain('could not be found');
    expect(metadata.title).toBe('Página não encontrada · Lumens');
  });

  it('a pauta não encontrada também usa h1', () => {
    expect(renderToStaticMarkup(<PautaNaoEncontrada />)).toMatch(
      /<h1[^>]*>Não encontramos essa pauta.<\/h1>/,
    );
  });
});
