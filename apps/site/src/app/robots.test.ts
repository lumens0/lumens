import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import robots from './robots';

describe('robots', () => {
  beforeEach(() => vi.stubEnv('LUMENS_SITE_URL', 'https://lumens.teste'));
  afterEach(() => vi.unstubAllEnvs());

  it('libera o site, fecha o /dev/ e aponta o sitemap absoluto', () => {
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: '/dev/' },
      sitemap: 'https://lumens.teste/sitemap.xml',
    });
  });
});
