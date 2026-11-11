import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import {
  ErroImagemGrande,
  ErroImagemInvalida,
  TAMANHO_MAXIMO_FOTO,
  passaDoTamanhoMaximo,
  removerMetadados,
} from './imagem';

// As fotos de teste são geradas aqui mesmo, com metadados parecidos com os de
// uma foto real de celular (marca, modelo, autor, GPS, XMP e orientação 6).
// Assim não é preciso guardar imagens binárias no repositório, e nenhum dado
// de pessoa real entra nele: a fixture é determinística e os valores são
// inventados (as coordenadas são as do centro de Maceió).
//
// A imagem tem a metade esquerda vermelha e a direita azul: é o que deixa
// conferir, pelos pixels, para que lado a foto foi girada.
const XMP =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:creator="Autor Secreto"/>' +
  '</rdf:RDF></x:xmpmeta>';

async function fotoComMetadados(formato: 'jpeg' | 'png' | 'webp', orientacao = 1) {
  const imagem = sharp({ create: { width: 40, height: 20, channels: 3, background: '#c00' } })
    .composite([
      {
        input: { create: { width: 20, height: 20, channels: 3, background: '#00c' } },
        left: 20,
        top: 0,
      },
    ])
    .withExif({
      IFD0: { Make: 'Apple', Model: 'iPhone 13', Artist: 'Autor Secreto' },
      IFD3: {
        GPSLatitudeRef: 'S',
        GPSLatitude: '9/1 39/1 0/1',
        GPSLongitudeRef: 'W',
        GPSLongitude: '35/1 44/1 0/1',
      },
    })
    .withXmp(XMP)
    .withMetadata({ orientation: orientacao });
  // WebP sem perda, para as cores da fixture não variarem com o codificador.
  return (formato === 'webp' ? imagem.webp({ lossless: true }) : imagem[formato]()).toBuffer();
}

/** Cor (R, G, B) de um pixel da imagem. */
async function pixel(imagem: Buffer, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(imagem).raw().toBuffer({ resolveWithObject: true });
  const inicio = (y * info.width + x) * info.channels;
  return [...data.subarray(inicio, inicio + 3)];
}

const ehVermelho = ([r = 0, g = 0, b = 0]: number[]) => r > 150 && g < 60 && b < 60;
const ehAzul = ([r = 0, g = 0, b = 0]: number[]) => b > 150 && r < 60 && g < 60;

describe.each(['jpeg', 'png', 'webp'] as const)('removerMetadados com %s', (formato) => {
  let entrada: Buffer;
  let saida: Buffer;

  beforeAll(async () => {
    entrada = await fotoComMetadados(formato);
    saida = await removerMetadados(entrada);
  });

  it('a foto de teste realmente tem metadados (sanidade)', async () => {
    const m = await sharp(entrada).metadata();
    expect(m.exif).toBeDefined();
    expect(m.xmp).toBeDefined();
    // O modelo do aparelho está mesmo nos bytes: é o que a saída não pode ter.
    expect(entrada.toString('latin1')).toContain('iPhone 13');
  });

  it('a saída não tem EXIF, XMP nem IPTC', async () => {
    const m = await sharp(saida).metadata();
    expect(m.exif).toBeUndefined();
    expect(m.xmp).toBeUndefined();
    expect(m.iptc).toBeUndefined();
  });

  it('nenhum dado pessoal sobra nos bytes do arquivo', () => {
    const bytes = saida.toString('latin1');
    for (const texto of ['iPhone', 'Apple', 'Autor Secreto', 'GPS']) {
      expect(bytes).not.toContain(texto);
    }
  });

  it('mantém o formato de entrada', async () => {
    const m = await sharp(saida).metadata();
    expect(m.format).toBe(formato);
  });
});

describe.each(['jpeg', 'png', 'webp'] as const)('orientação com %s', (formato) => {
  it('foto com Orientation = 6 sai girada nos pixels e sem a tag', async () => {
    const entrada = await fotoComMetadados(formato, 6); // 40x20 deitada
    expect((await sharp(entrada).metadata()).orientation).toBe(6);

    const saida = await removerMetadados(entrada);
    const m = await sharp(saida).metadata();

    expect(m.format).toBe(formato);
    expect(m.width).toBe(20); // largura e altura trocadas
    expect(m.height).toBe(40);
    expect(m.orientation).toBeUndefined();
    // Girada 90° no sentido horário, como o celular mostraria: o que estava à
    // esquerda (vermelho) fica em cima e o que estava à direita (azul), embaixo.
    expect(ehVermelho(await pixel(saida, 10, 5))).toBe(true);
    expect(ehAzul(await pixel(saida, 10, 35))).toBe(true);
  });

  it('foto sem rotação (Orientation = 1) mantém a posição', async () => {
    const saida = await removerMetadados(await fotoComMetadados(formato));
    const m = await sharp(saida).metadata();

    expect(m.width).toBe(40);
    expect(m.height).toBe(20);
    expect(ehVermelho(await pixel(saida, 5, 10))).toBe(true);
    expect(ehAzul(await pixel(saida, 35, 10))).toBe(true);
  });
});

describe('limite de 5 MB', () => {
  /** Foto válida com o arquivo esticado até `tamanho` bytes (sobra depois do fim da imagem). */
  async function fotoCom(tamanho: number) {
    const foto = await fotoComMetadados('png');
    return Buffer.concat([foto, Buffer.alloc(tamanho - foto.length)]);
  }

  it.each([
    ['um byte abaixo', TAMANHO_MAXIMO_FOTO - 1, false],
    ['exatamente no limite', TAMANHO_MAXIMO_FOTO, false],
    ['um byte acima', TAMANHO_MAXIMO_FOTO + 1, true],
  ])('%s', async (_caso, tamanho, recusada) => {
    expect(passaDoTamanhoMaximo(tamanho)).toBe(recusada);

    const resultado = removerMetadados(await fotoCom(tamanho));
    if (recusada) await expect(resultado).rejects.toThrow(ErroImagemGrande);
    else expect((await sharp(await resultado).metadata()).format).toBe('png');
  });

  it('o limite é 5 MB', () => {
    expect(TAMANHO_MAXIMO_FOTO).toBe(5 * 1024 * 1024);
  });
});

describe('arquivos inválidos', () => {
  it('rejeita buffer vazio', async () => {
    await expect(removerMetadados(Buffer.alloc(0))).rejects.toThrow(ErroImagemInvalida);
  });

  it('rejeita arquivo que não é imagem', async () => {
    await expect(removerMetadados(Buffer.from('isto não é uma foto'))).rejects.toThrow(
      ErroImagemInvalida,
    );
  });

  it('rejeita JPEG corrompido (cortado no meio)', async () => {
    const jpeg = await fotoComMetadados('jpeg');
    const cortado = jpeg.subarray(0, Math.floor(jpeg.length / 2));
    await expect(removerMetadados(cortado)).rejects.toThrow(ErroImagemInvalida);
  });

  it('rejeita formato fora da lista (GIF)', async () => {
    const gif = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#000' },
    })
      .gif()
      .toBuffer();
    await expect(removerMetadados(gif)).rejects.toThrow(/Formato não suportado/);
  });
});
