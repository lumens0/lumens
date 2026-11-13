import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buscarPauta } from '../../../../dados/api';
import { fixture } from '../../../../dados/pauta-detalhe-teste';
import { GET } from './route';

vi.mock('../../../../dados/api', () => ({ buscarPauta: vi.fn() }));

const pedir = (slug: string) =>
  GET(new Request(`https://lumens.teste/p/${slug}/og.png`), {
    params: Promise.resolve({ slug }),
  });

/** Largura e altura do cabeçalho IHDR, que todo PNG traz logo depois da assinatura. */
function dimensoes(png: Buffer) {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return { largura: png.readUInt32BE(16), altura: png.readUInt32BE(20) };
}

// Gerar a imagem leva segundos no CI, e o primeiro teste ainda lê as fontes e inicia o satori.
describe('GET /p/[slug]/og.png', { timeout: 30_000 }, () => {
  beforeEach(() => vi.mocked(buscarPauta).mockReset());

  it('devolve PNG 1200 × 630 abaixo de 300 KB, com o cache do card vertical', async () => {
    vi.mocked(buscarPauta).mockResolvedValue(fixture);
    const resposta = await pedir(fixture.slug);
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('content-type')).toBe('image/png');
    expect(resposta.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300');
    const png = Buffer.from(await resposta.arrayBuffer());
    expect(dimensoes(png)).toEqual({ largura: 1200, altura: 630 });
    expect(png.length).toBeLessThan(300 * 1024);
    expect(buscarPauta).toHaveBeenCalledWith(fixture.slug, { fresca: true });
  });

  it('título e bloco longos ainda geram um PNG válido (o encaixe foi conferido no olho)', async () => {
    vi.mocked(buscarPauta).mockResolvedValue({
      ...fixture,
      titulo: 'Palavra '.repeat(60),
      bloco_nome: 'Bloco '.repeat(30),
      apoios: 12345,
      meta: 20000,
    });
    const png = Buffer.from(await (await pedir(fixture.slug)).arrayBuffer());
    expect(dimensoes(png)).toEqual({ largura: 1200, altura: 630 });
  });

  it('pauta que a API não acha dá 404 sem cache', async () => {
    vi.mocked(buscarPauta).mockResolvedValue(null);
    const resposta = await pedir('nao-existe');
    expect(resposta.status).toBe(404);
    expect(resposta.headers.get('cache-control')).toBe('no-store');
  });

  it.each(['em_curadoria', 'recusada'])('pauta em %s dá 404', async (status) => {
    vi.mocked(buscarPauta).mockResolvedValue({ ...fixture, status } as never);
    expect((await pedir(fixture.slug)).status).toBe(404);
  });
});
