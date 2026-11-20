import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buscarFoto, buscarPauta } from '../../../../dados/api';
import { fixture } from '../../../../dados/pauta-detalhe-teste';
import { fotoDaConquista, janelasAcesas, qrDoLink } from '../card';
import { GET } from './route';

vi.mock('../../../../dados/api', () => ({ buscarPauta: vi.fn(), buscarFoto: vi.fn() }));

// JPEG de verdade (1×1, cinza): o satori decodifica a imagem ao desenhar o card.
const JPEG = Uint8Array.from(
  Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    'base64',
  ),
).buffer;

const pedir = (slug: string) =>
  GET(new Request(`https://lumens.teste/p/${slug}/card.png`), {
    params: Promise.resolve({ slug }),
  });

/** Largura e altura do cabeçalho IHDR, que todo PNG traz logo depois da assinatura. */
function dimensoes(png: Buffer) {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return { largura: png.readUInt32BE(16), altura: png.readUInt32BE(20) };
}

// Gerar a imagem leva segundos no CI, e o primeiro teste ainda lê as fontes e inicia o satori.
describe('GET /p/[slug]/card.png', { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.mocked(buscarPauta).mockReset();
    vi.mocked(buscarFoto).mockReset();
  });

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
    expect(buscarPauta).toHaveBeenCalledWith(fixture.slug, { fresca: true });
  });

  it('título muito longo ainda gera a imagem no mesmo tamanho', async () => {
    vi.mocked(buscarPauta).mockResolvedValue({ ...fixture, titulo: 'Palavra '.repeat(60) });
    const resposta = await pedir(fixture.slug);
    expect(dimensoes(Buffer.from(await resposta.arrayBuffer()))).toEqual({
      largura: 1080,
      altura: 1920,
    });
  });

  describe('pauta conquistada: card de conquista', () => {
    const conquistada = {
      ...fixture,
      status: 'conquistada',
      linha_do_tempo: [
        {
          tipo: 'status_alterado',
          criado_em: '2026-11-10T12:00:00-03:00',
          dados: { para: 'conquistada' },
        },
      ],
    } as never;
    const executada = {
      tipo: 'proposta',
      status: 'executada',
      descricao: 'A prefeitura do campus instalou os bebedouros novos no térreo do bloco.',
      executada_em: '2026-11-09',
    };

    it('renderiza sem texto do que foi feito: fachada toda acesa no lugar da foto', async () => {
      vi.mocked(buscarPauta).mockResolvedValue({
        ...(conquistada as object),
        caminhos: [],
      } as never);
      const resposta = await pedir(fixture.slug);
      expect(resposta.status).toBe(200);
      expect(dimensoes(Buffer.from(await resposta.arrayBuffer()))).toEqual({
        largura: 1080,
        altura: 1920,
      });
    });

    it('renderiza com o texto da solução executada, mesmo longo', async () => {
      vi.mocked(buscarPauta).mockResolvedValue({
        ...(conquistada as object),
        caminhos: [{ ...executada, descricao: 'Texto longo. '.repeat(80) }],
      } as never);
      const resposta = await pedir(fixture.slug);
      expect(resposta.status).toBe(200);
      expect(dimensoes(Buffer.from(await resposta.arrayBuffer())).altura).toBe(1920);
    });

    describe('com o texto e a foto da curadoria (SCRUM-394)', () => {
      const CHAVE = 'fotos/2026/11/0b6c1f7e-5d1a-4a53-9a47-3f2b9a1c7d10.jpg';
      const daCuradoria = {
        ...(conquistada as object),
        caminhos: [executada],
        o_que_foi_feito: 'Trocaram as lâmpadas do corredor do bloco.',
        foto: CHAVE,
      } as never;

      it('busca a foto pelo caminho público e desenha o card no mesmo tamanho', async () => {
        vi.mocked(buscarPauta).mockResolvedValue(daCuradoria);
        vi.mocked(buscarFoto).mockResolvedValue({ bytes: JPEG, tipo: 'image/jpeg' });
        const resposta = await pedir(fixture.slug);
        expect(resposta.status).toBe(200);
        expect(buscarFoto).toHaveBeenCalledWith(
          '2026',
          '11',
          '0b6c1f7e-5d1a-4a53-9a47-3f2b9a1c7d10.jpg',
        );
        expect(dimensoes(Buffer.from(await resposta.arrayBuffer()))).toEqual({
          largura: 1080,
          altura: 1920,
        });
      });

      it('foto que não abre não derruba o card: sai com a fachada acesa', async () => {
        vi.mocked(buscarPauta).mockResolvedValue(daCuradoria);
        vi.mocked(buscarFoto).mockRejectedValue(new Error('API fora'));
        const resposta = await pedir(fixture.slug);
        expect(resposta.status).toBe(200);
        expect(dimensoes(Buffer.from(await resposta.arrayBuffer())).altura).toBe(1920);
      });

      it('pauta sem foto da curadoria nem chega a pedir a foto', async () => {
        vi.mocked(buscarPauta).mockResolvedValue({
          ...(daCuradoria as object),
          foto: null,
        } as never);
        expect((await pedir(fixture.slug)).status).toBe(200);
        expect(buscarFoto).not.toHaveBeenCalled();
      });

      it('só a pauta conquistada usa a foto: o card de andamento ignora', async () => {
        vi.mocked(buscarPauta).mockResolvedValue({ ...fixture, foto: CHAVE });
        expect((await pedir(fixture.slug)).status).toBe(200);
        expect(buscarFoto).not.toHaveBeenCalled();
      });
    });

    it('renderiza sem data de conquista, sem "NaN dias"', async () => {
      vi.mocked(buscarPauta).mockResolvedValue({
        ...(conquistada as object),
        linha_do_tempo: [],
        caminhos: [executada],
      } as never);
      expect((await pedir(fixture.slug)).status).toBe(200);
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

describe('fotoDaConquista', () => {
  beforeEach(() => vi.mocked(buscarFoto).mockReset());
  const CHAVE = 'fotos/2026/11/abc-123.jpg';

  it('vira data URI com o tipo que o back-end informou', async () => {
    vi.mocked(buscarFoto).mockResolvedValue({ bytes: JPEG, tipo: 'image/jpeg' });
    const uri = await fotoDaConquista(CHAVE);
    expect(uri).toBe(`data:image/jpeg;base64,${Buffer.from(JPEG).toString('base64')}`);
    expect(buscarFoto).toHaveBeenCalledWith('2026', '11', 'abc-123.jpg');
  });

  it('aceita o tipo com parâmetro e PNG', async () => {
    vi.mocked(buscarFoto).mockResolvedValue({ bytes: JPEG, tipo: 'image/png; charset=binary' });
    expect(await fotoDaConquista(CHAVE)).toMatch(/^data:image\/png;base64,/);
  });

  it.each([
    ['sem chave', null],
    ['chave com caminho estranho', '../fotos/2026/11/a.jpg'],
    ['chave de outro bucket', 'respostas/2026/11/a.pdf'],
  ])('%s: nem pede a foto', async (_nome, chave) => {
    expect(await fotoDaConquista(chave)).toBeNull();
    expect(buscarFoto).not.toHaveBeenCalled();
  });

  it('404, tipo que o satori não abre (WebP) e erro da API dão null', async () => {
    vi.mocked(buscarFoto).mockResolvedValueOnce(null);
    expect(await fotoDaConquista(CHAVE)).toBeNull();
    vi.mocked(buscarFoto).mockResolvedValueOnce({ bytes: JPEG, tipo: 'image/webp' });
    expect(await fotoDaConquista(CHAVE)).toBeNull();
    vi.mocked(buscarFoto).mockRejectedValueOnce(new Error('API fora'));
    expect(await fotoDaConquista(CHAVE)).toBeNull();
  });
});

describe('janelasAcesas (a fachada do card)', () => {
  it.each([
    [0, 120, 0],
    [1, 120, 1],
    [72, 120, 18],
    [120, 120, 30],
    [300, 120, 30],
  ])('%i de %i apoios acendem %i de 30 janelas', (apoios, meta, acesas) => {
    expect(janelasAcesas(apoios, meta, 30)).toBe(acesas);
  });
});

describe('qrDoLink (o QR Code do card)', () => {
  const svgDe = (link: string) =>
    Buffer.from(qrDoLink(link).replace('data:image/svg+xml;base64,', ''), 'base64').toString();

  it('é um SVG em data URI, escuro sobre fundo claro', () => {
    expect(qrDoLink('https://lumens.teste/p/a')).toMatch(/^data:image\/svg\+xml;base64,/);
    const svg = svgDe('https://lumens.teste/p/a');
    expect(svg).toContain('<svg');
    expect(svg).toContain('#ffffff');
    expect(svg).toContain('#141936');
  });

  it('muda com o link: cada pauta tem o QR da própria página', () => {
    expect(svgDe('https://lumens.teste/p/a')).not.toBe(svgDe('https://lumens.teste/p/b'));
  });
});
