import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buscarPauta } from '../../../../dados/api';
import { fixture } from '../../../../dados/pauta-detalhe-teste';
import { GET } from './route';

vi.mock('../../../../dados/api', () => ({ buscarPauta: vi.fn() }));

const pedir = (slug: string) =>
  GET(new Request(`https://lumens.teste/p/${slug}/card.png`), {
    params: Promise.resolve({ slug }),
  });

/** Largura e altura do cabeçalho IHDR, que todo PNG traz logo depois da assinatura. */
function dimensoes(png: Buffer) {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return { largura: png.readUInt32BE(16), altura: png.readUInt32BE(20) };
}

describe('GET /p/[slug]/card.png', () => {
  beforeEach(() => vi.mocked(buscarPauta).mockReset());

  it('devolve PNG 1080 × 1920 com cache de 5 min, lendo a mesma pauta da página', async () => {
    vi.mocked(buscarPauta).mockResolvedValue(fixture);
    const resposta = await pedir(fixture.slug);
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('content-type')).toBe('image/png');
    expect(resposta.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300');
    expect(dimensoes(Buffer.from(await resposta.arrayBuffer()))).toEqual({
      largura: 1080,
      altura: 1920,
    });
    expect(buscarPauta).toHaveBeenCalledWith(fixture.slug);
  });

  it('título muito longo ainda gera a imagem no mesmo tamanho', async () => {
    vi.mocked(buscarPauta).mockResolvedValue({ ...fixture, titulo: 'Palavra '.repeat(60) });
    const resposta = await pedir(fixture.slug);
    expect(dimensoes(Buffer.from(await resposta.arrayBuffer()))).toEqual({
      largura: 1080,
      altura: 1920,
    });
  });

  it('pauta que a API não acha dá 404 sem cache', async () => {
    vi.mocked(buscarPauta).mockResolvedValue(null);
    const resposta = await pedir('nao-existe');
    expect(resposta.status).toBe(404);
    expect(resposta.headers.get('cache-control')).toBe('no-store');
  });

  it.each(['em_curadoria', 'recusada'])('pauta em %s dá 404', async (status) => {
    // Status que a API nunca devolve: o card, como a página, não confia só no filtro de lá.
    vi.mocked(buscarPauta).mockResolvedValue({ ...fixture, status } as never);
    expect((await pedir(fixture.slug)).status).toBe(404);
  });
});
