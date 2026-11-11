import { readFileSync, statSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

// `next/font/local` só existe no build do Next; no teste basta devolver as variáveis.
vi.mock('next/font/local', () => ({ default: () => ({ variable: '' }) }));

const PUBLICO = new URL('../../public/', import.meta.url);

async function metadataCom(siteUrl: string) {
  vi.resetModules();
  vi.stubEnv('LUMENS_SITE_URL', siteUrl);
  return (await import('./layout')).metadata;
}

describe('metadados da marca (SCRUM-31)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('og:image da marca resolve para URL absoluta HTTPS na origem do site', async () => {
    const metadata = await metadataCom('https://lumens.teste');
    const [imagem] = metadata.openGraph?.images as [{ url: string }];
    expect(new URL(imagem.url, metadata.metadataBase ?? undefined).href).toBe(
      'https://lumens.teste/og-lumens.png',
    );
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
    // Herdado pelas páginas sem metadados próprios: um `og:url` aqui apontaria todas para `/`.
    expect(metadata.openGraph).not.toHaveProperty('url');
  });

  it('a imagem existe, é horizontal e tem menos de 300 KB (o WhatsApp descarta as pesadas)', () => {
    const arquivo = new URL('og-lumens.png', PUBLICO);
    expect(statSync(arquivo).size).toBeLessThan(300 * 1024);
    // Largura e altura ficam nos bytes 16..23 do cabeçalho IHDR do PNG.
    const png = readFileSync(arquivo);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });
});

// Cada página com prévia da marca define o próprio `openGraph`, que substitui o do layout inteiro:
// se uma delas esquecer a imagem, a prévia some sem nenhum outro teste acusar.
describe.each([
  ['/', () => import('./page')],
  ['/conquistas', () => import('./conquistas/page')],
  ['/atividade', () => import('./atividade/page')],
  ['/privacidade', () => import('./privacidade/page')],
])('prévia da página %s', (caminho, carregar) => {
  it('tem og:url própria e a imagem da marca', async () => {
    const { metadata } = await carregar();
    expect(metadata.openGraph).toMatchObject({
      url: caminho,
      siteName: 'Lumens',
      images: [expect.objectContaining({ url: '/og-lumens.png' })],
    });
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
  });
});
