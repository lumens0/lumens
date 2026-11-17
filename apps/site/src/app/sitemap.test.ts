import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buscarPautas } from '../dados/api';
import type { StatusPauta } from '../dados/tipos';
import sitemap from './sitemap';

vi.mock('../dados/api', () => ({ buscarPautas: vi.fn() }));
vi.mock('next/server', () => ({ connection: vi.fn(() => Promise.resolve()) }));

const pauta = (slug: string, status: StatusPauta) =>
  ({ slug, status, apoios: 0, criada_em: '2026-01-01T00:00:00Z' }) as unknown as Awaited<
    ReturnType<typeof buscarPautas>
  >[number];

const FIXAS = ['/', '/conquistas', '/atividade', '/mapa', '/privacidade'].map(
  (c) => `https://lumens.teste${c}`,
);

describe('sitemap', () => {
  beforeEach(() => {
    vi.stubEnv('LUMENS_SITE_URL', 'https://lumens.teste');
    vi.mocked(buscarPautas).mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('lista as páginas fixas e as pautas públicas, sem curadoria, recusada nem /dev/', async () => {
    vi.mocked(buscarPautas).mockResolvedValue([
      pauta('aberta', 'juntando_apoios'),
      pauta('em-curadoria', 'em_curadoria'),
      pauta('recusada', 'recusada'),
      pauta('conquistada', 'conquistada'),
    ]);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toEqual([
      ...FIXAS,
      'https://lumens.teste/p/aberta',
      'https://lumens.teste/p/conquistada',
    ]);
    expect(urls.some((u) => u.includes('/dev/'))).toBe(false);
  });

  it('com a API fora do ar, responde só as páginas fixas', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(buscarPautas).mockRejectedValue(new Error('timeout'));
    expect((await sitemap()).map((e) => e.url)).toEqual(FIXAS);
    expect(erro).toHaveBeenCalled();
  });
});
