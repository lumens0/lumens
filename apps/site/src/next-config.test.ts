import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import config from '../next.config';

describe('next.config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('build de produção sem número falha', () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '');
    expect(() => config(PHASE_PRODUCTION_BUILD)).toThrow(
      /NEXT_PUBLIC_WHATSAPP_BOT não configurada/,
    );
  });

  it('build de produção com número devolve a config', () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '5500000000000');
    expect(config(PHASE_PRODUCTION_BUILD)).toMatchObject({ agentRules: false });
  });

  it('build de produção com canal telegram exige o usuário do bot', () => {
    vi.stubEnv('NEXT_PUBLIC_CANAL_BOT', 'telegram');
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '5500000000000');
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT', '');
    expect(() => config(PHASE_PRODUCTION_BUILD)).toThrow(
      /NEXT_PUBLIC_TELEGRAM_BOT não configurada/,
    );
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '');
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT', 'LumensBot');
    expect(config(PHASE_PRODUCTION_BUILD)).toMatchObject({ agentRules: false });
  });

  it('build de produção com canal desconhecido falha', () => {
    vi.stubEnv('NEXT_PUBLIC_CANAL_BOT', 'signal');
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '5500000000000');
    expect(() => config(PHASE_PRODUCTION_BUILD)).toThrow(/NEXT_PUBLIC_CANAL_BOT inválida/);
  });

  it('next dev sem número não falha', () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '');
    expect(config(PHASE_DEVELOPMENT_SERVER)).toMatchObject({ agentRules: false });
  });

  describe('cabeçalhos (SCRUM-377 e SCRUM-379)', () => {
    async function regras() {
      vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '5500000000000');
      const headers = config(PHASE_PRODUCTION_BUILD).headers;
      return (await headers?.()) ?? [];
    }
    const valor = (cabecalhos: { key: string; value: string }[], chave: string) =>
      cabecalhos.find((c) => c.key === chave)?.value;

    it('todas as rotas saem com os cabeçalhos de segurança e sem iframe', async () => {
      const todas = (await regras()).find((r) => r.source === '/:path*')?.headers ?? [];
      expect(valor(todas, 'X-Content-Type-Options')).toBe('nosniff');
      expect(valor(todas, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(valor(todas, 'Permissions-Policy')).toContain('camera=()');
      expect(valor(todas, 'X-Frame-Options')).toBe('DENY');
      expect(valor(todas, 'Content-Security-Policy')).toBe("frame-ancestors 'none'");
      expect(valor(todas, 'Content-Security-Policy-Report-Only')).toContain("default-src 'self'");
    });

    it('home, mapa, conquistas, atividade e pauta vão para a CDN por 15 s', async () => {
      const regrasDeCache = (await regras()).filter((r) =>
        r.headers.some((c) => c.key === 'Cache-Control'),
      );
      expect(regrasDeCache.map((r) => r.source).sort()).toEqual(
        ['/', '/atividade', '/conquistas', '/mapa', '/p/:slug'].sort(),
      );
      for (const regra of regrasDeCache)
        expect(valor(regra.headers, 'Cache-Control')).toContain('s-maxage=15');
    });
  });
});
