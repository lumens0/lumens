import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  FOTO_DA_CONQUISTA_MAXIMO,
  chaveDaFotoDaConquista,
  prepararFotoDaConquista,
} from './conquista-foto';

/** JPEG com localização (GPS) e orientação no EXIF, como sai de um celular. */
async function fotoComGps(largura = 400, altura = 300) {
  return sharp({ create: { width: largura, height: altura, channels: 3, background: '#808080' } })
    .jpeg()
    .withMetadata({
      orientation: 6,
      exif: {
        IFD0: { Make: 'Aparelho' },
        IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '9/1 39/1 0/1', GPSLongitudeRef: 'W' },
      },
    })
    .toBuffer();
}

describe('prepararFotoDaConquista', () => {
  it('tira o EXIF (GPS e aparelho) e aplica a orientação nos pixels', async () => {
    const entrada = await fotoComGps();
    const antes = await sharp(entrada).metadata();
    expect(antes.exif).toBeDefined();
    expect(antes.orientation).toBe(6);

    const saida = await prepararFotoDaConquista(entrada);
    expect(saida.ok).toBe(true);
    if (!saida.ok) return;
    const meta = await sharp(saida.bytes).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    // Orientação 6 (girada 90°): 400×300 vira 300×400 já nos pixels, sem etiqueta.
    expect([meta.width, meta.height]).toEqual([300, 400]);
    expect(meta.orientation).toBeUndefined();
    expect(saida.bytes.includes(Buffer.from('Aparelho'))).toBe(false);
  });

  it('PNG e WebP viram JPEG; a transparência cai no branco', async () => {
    const png = await sharp({
      create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const saida = await prepararFotoDaConquista(png);
    expect(saida.ok).toBe(true);
    if (!saida.ok) return;
    const { data } = await sharp(saida.bytes).raw().toBuffer({ resolveWithObject: true });
    expect([...data.subarray(0, 3)].every((canal) => canal >= 250)).toBe(true);

    const webp = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } })
      .webp()
      .toBuffer();
    expect((await prepararFotoDaConquista(webp)).ok).toBe(true);
  });

  it('reduz foto grande para no máximo 1600 px de lado, sem ampliar a pequena', async () => {
    const grande = await prepararFotoDaConquista(
      await sharp({ create: { width: 3200, height: 1600, channels: 3, background: '#888' } })
        .jpeg()
        .toBuffer(),
    );
    expect(grande.ok).toBe(true);
    if (grande.ok) {
      const { width, height } = await sharp(grande.bytes).metadata();
      expect([width, height]).toEqual([1600, 800]);
    }
    const pequena = await prepararFotoDaConquista(
      await sharp({ create: { width: 50, height: 30, channels: 3, background: '#fff' } })
        .jpeg()
        .toBuffer(),
    );
    expect(pequena.ok).toBe(true);
    if (pequena.ok) expect((await sharp(pequena.bytes).metadata()).width).toBe(50);
  });

  it('recusa vazio, passa de 5 MB, formato que não é foto e arquivo corrompido', async () => {
    expect(await prepararFotoDaConquista(Buffer.alloc(0))).toEqual({
      ok: false,
      motivo: 'invalida',
    });
    expect(await prepararFotoDaConquista(Buffer.alloc(FOTO_DA_CONQUISTA_MAXIMO + 1))).toEqual({
      ok: false,
      motivo: 'tamanho',
    });
    const gif = await sharp({ create: { width: 5, height: 5, channels: 3, background: '#fff' } })
      .gif()
      .toBuffer();
    expect(await prepararFotoDaConquista(gif)).toEqual({ ok: false, motivo: 'formato' });
    expect(await prepararFotoDaConquista(Buffer.from('isto não é uma imagem'))).toEqual({
      ok: false,
      motivo: 'invalida',
    });
  });
});

describe('chaveDaFotoDaConquista', () => {
  it('segue o formato que a rota pública e a do painel aceitam', () => {
    expect(chaveDaFotoDaConquista(new Date('2026-11-19T12:00:00Z'))).toMatch(
      /^fotos\/2026\/11\/[0-9a-f-]{36}\.jpg$/,
    );
  });
});
