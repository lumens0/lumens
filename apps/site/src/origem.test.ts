import { describe, expect, it } from 'vitest';
import { origemDoSite } from './origem';

const origem = (env: Record<string, string>) => origemDoSite(env as NodeJS.ProcessEnv).href;

describe('origemDoSite', () => {
  it('usa LUMENS_SITE_URL quando é uma URL válida', () => {
    expect(origem({ LUMENS_SITE_URL: 'https://lumens.teste', VERCEL_URL: 'x.vercel.app' })).toBe(
      'https://lumens.teste/',
    );
  });

  it('sem LUMENS_SITE_URL, usa o deploy atual da Vercel', () => {
    expect(origem({ VERCEL_URL: 'lumens-git-x.vercel.app' })).toBe(
      'https://lumens-git-x.vercel.app/',
    );
  });

  it('LUMENS_SITE_URL sem esquema não lança: cai no próximo da ordem', () => {
    expect(origem({ LUMENS_SITE_URL: 'lumens-ufal.vercel.app' })).toBe(
      'https://lumens-ufal.vercel.app/',
    );
    expect(origem({ LUMENS_SITE_URL: 'lumens.teste', VERCEL_URL: 'p.vercel.app' })).toBe(
      'https://p.vercel.app/',
    );
  });

  it.each(['localhost:3000', 'ftp://x'])(
    'LUMENS_SITE_URL %s (não http/https) é ignorada',
    (valor) => {
      expect(origem({ LUMENS_SITE_URL: valor, VERCEL_URL: 'p.vercel.app' })).toBe(
        'https://p.vercel.app/',
      );
    },
  );

  it('sem nenhuma das duas, usa produção', () => {
    expect(origem({ LUMENS_SITE_URL: ' ', VERCEL_URL: '' })).toBe(
      'https://lumens-ufal.vercel.app/',
    );
  });
});
