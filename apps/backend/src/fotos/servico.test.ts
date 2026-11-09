import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { ErroDeMidia, type MidiaBaixada } from './meta-midia';
import { criarServicoDeFotos, type DependenciasDasFotos } from './servico';

/** Foto como sai do celular: com marca, modelo, autor e GPS no EXIF. */
async function fotoDeCelular(formato: 'jpeg' | 'png' | 'webp') {
  return sharp({ create: { width: 40, height: 20, channels: 3, background: '#c33' } })
    .withExif({
      IFD0: { Make: 'Apple', Model: 'iPhone 13', Artist: 'Autor Secreto' },
      IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '9/1 39/1 0/1' },
    })
    [formato]()
    .toBuffer();
}

let jpeg: Buffer;
let png: Buffer;
let webp: Buffer;

beforeAll(async () => {
  [jpeg, png, webp] = await Promise.all([
    fotoDeCelular('jpeg'),
    fotoDeCelular('png'),
    fotoDeCelular('webp'),
  ]);
});

interface Guardada {
  chave: string;
  bytes: Buffer;
  contentType: string;
}

function montar(baixada: MidiaBaixada | Error, opcoes: { storageFalha?: boolean } = {}) {
  const guardadas: Guardada[] = [];
  const baixados: string[] = [];
  const avisos: string[] = [];
  const deps: DependenciasDasFotos = {
    baixar: (id) => {
      baixados.push(id);
      return baixada instanceof Error ? Promise.reject(baixada) : Promise.resolve(baixada);
    },
    storage: {
      guardar: (chave, bytes, contentType) => {
        if (opcoes.storageFalha) return Promise.reject(new Error('bucket fora do ar'));
        guardadas.push({ chave, bytes, contentType });
        return Promise.resolve();
      },
    },
    agora: () => new Date('2026-11-09T12:00:00Z'),
    avisar: (m) => avisos.push(m),
  };
  return { servico: criarServicoDeFotos(deps), guardadas, baixados, avisos };
}

describe('guardarFoto', () => {
  it('baixa, tira os metadados e guarda com chave aleatória por mês', async () => {
    const { servico, guardadas } = montar({ bytes: jpeg, mimeType: 'image/jpeg' });
    const r = await servico.guardarFoto({ id: 'midia-1', mimeType: 'image/jpeg' });

    expect(r).toEqual({
      ok: true,
      chave: expect.stringMatching(/^fotos\/2026\/11\/[0-9a-f-]{36}\.jpg$/),
    });
    expect(guardadas).toHaveLength(1);
    const [guardada] = guardadas;
    if (!r.ok || guardada === undefined) throw new Error('foto não guardada');
    expect(guardada.chave).toBe(r.chave);
    expect(guardada.contentType).toBe('image/jpeg');

    const antes = await sharp(jpeg).metadata();
    const depois = await sharp(guardada.bytes).metadata();
    expect(antes.exif).toBeDefined();
    expect(depois.exif).toBeUndefined();
    expect(depois.format).toBe('jpeg');
  });

  it('PNG vira .png', async () => {
    const { servico, guardadas } = montar({ bytes: png, mimeType: 'image/png' });
    const r = await servico.guardarFoto({ id: 'm', mimeType: 'image/png' });
    expect(r).toMatchObject({ ok: true, chave: expect.stringMatching(/\.png$/) });
    expect(guardadas[0]?.contentType).toBe('image/png');
  });

  it('tipo fora de JPEG/PNG é recusado sem baixar', async () => {
    const { servico, baixados } = montar({ bytes: jpeg, mimeType: 'image/jpeg' });
    expect(await servico.guardarFoto({ id: 'm', mimeType: 'image/gif' })).toEqual({
      ok: false,
      motivo: 'formato',
    });
    expect(baixados).toEqual([]);
  });

  it('WebP disfarçado de JPEG é recusado pelo conteúdo', async () => {
    const { servico, guardadas } = montar({ bytes: webp, mimeType: 'image/jpeg' });
    expect(await servico.guardarFoto({ id: 'm', mimeType: 'image/jpeg' })).toEqual({
      ok: false,
      motivo: 'formato',
    });
    expect(guardadas).toEqual([]);
  });

  it('arquivo que não é imagem', async () => {
    const { servico } = montar({ bytes: Buffer.from('não sou imagem'), mimeType: 'image/jpeg' });
    expect(await servico.guardarFoto({ id: 'm', mimeType: 'image/jpeg' })).toEqual({
      ok: false,
      motivo: 'invalida',
    });
  });

  it('foto grande demais', async () => {
    const { servico } = montar(new ErroDeMidia('tamanho', 'grande'));
    expect(await servico.guardarFoto({ id: 'm', mimeType: 'image/jpeg' })).toEqual({
      ok: false,
      motivo: 'tamanho',
    });
  });

  it('Meta fora do ar: indisponível, com aviso no log', async () => {
    const { servico, avisos } = montar(new ErroDeMidia('indisponivel', 'HTTP 500'));
    expect(await servico.guardarFoto({ id: 'm', mimeType: 'image/jpeg' })).toEqual({
      ok: false,
      motivo: 'indisponivel',
    });
    expect(avisos).toHaveLength(1);
  });

  it('storage fora do ar: indisponível', async () => {
    const { servico } = montar({ bytes: jpeg, mimeType: 'image/jpeg' }, { storageFalha: true });
    expect(await servico.guardarFoto({ id: 'm', mimeType: 'image/jpeg' })).toEqual({
      ok: false,
      motivo: 'indisponivel',
    });
  });

  it('aceita o tipo com parâmetros e em maiúsculas', async () => {
    const { servico } = montar({ bytes: jpeg, mimeType: 'IMAGE/JPEG; charset=binary' });
    const r = await servico.guardarFoto({ id: 'm', mimeType: 'image/jpeg; x=1' });
    expect(r.ok).toBe(true);
  });
});
