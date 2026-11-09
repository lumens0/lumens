import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Home from './page';

// O filtro usa o router do Next, que não existe fora do app.
vi.mock('../componentes/FiltroBloco', () => ({ FiltroBloco: () => null }));

describe('home', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('com a lista vazia, "Relatar um problema" aparece uma vez só (o da ListaVazia)', async () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '5582999999999');
    // Os dados de exemplo ainda não têm pautas: a home cai na lista vazia.
    const html = renderToStaticMarkup(await Home({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('role="status"');
    expect(html.match(/Relatar um problema<\/a>/g)).toHaveLength(1);
  });
});
