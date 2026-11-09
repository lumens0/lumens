import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture } from '../../../componentes/pauta/fixture';
import { buscarPauta } from '../../../dados/api';
import PaginaPauta, { generateMetadata } from './page';

const NAO_ENCONTRADO = new Error('NEXT_NOT_FOUND');

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw NAO_ENCONTRADO;
  }),
}));
vi.mock('../../../dados/api', () => ({ buscarPauta: vi.fn() }));

const props = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe('página /p/[slug]', () => {
  beforeEach(() => vi.mocked(buscarPauta).mockReset());

  it('renderiza a pauta e usa o título nos metadados', async () => {
    vi.mocked(buscarPauta).mockResolvedValue(fixture);
    const html = renderToStaticMarkup(await PaginaPauta(props(fixture.slug)));
    expect(html).toContain(fixture.titulo);
    expect(await generateMetadata(props(fixture.slug))).toEqual({ title: fixture.titulo });
    expect(buscarPauta).toHaveBeenCalledWith(fixture.slug);
  });

  it('chama notFound quando a API não acha a pauta', async () => {
    vi.mocked(buscarPauta).mockResolvedValue(null);
    await expect(PaginaPauta(props('nao-existe'))).rejects.toBe(NAO_ENCONTRADO);
    await expect(generateMetadata(props('nao-existe'))).rejects.toBe(NAO_ENCONTRADO);
  });

  it.each(['em_curadoria', 'recusada'])('chama notFound para status %s', async (status) => {
    // Status que a API nunca devolve: a página não confia só no filtro de lá.
    vi.mocked(buscarPauta).mockResolvedValue({ ...fixture, status } as never);
    await expect(PaginaPauta(props(fixture.slug))).rejects.toBe(NAO_ENCONTRADO);
  });
});
