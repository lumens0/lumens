import { describe, expect, it } from 'vitest';
import config from '../next.config';

describe('cabeçalhos de segurança do painel (SCRUM-377)', () => {
  it('o painel não abre dentro de outro site e a CSP fecha as origens', async () => {
    const regras = (await config.headers?.()) ?? [];
    const cabecalhos = regras.find((r) => r.source === '/:path*')?.headers ?? [];
    const valor = (chave: string) => cabecalhos.find((c) => c.key === chave)?.value;
    expect(valor('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(valor('Content-Security-Policy')).toContain("frame-ancestors 'self'");
    expect(valor('Content-Security-Policy')).toContain("default-src 'self'");
    expect(valor('Content-Security-Policy')).toContain("frame-src 'self'");
    expect(valor('X-Content-Type-Options')).toBe('nosniff');
    expect(valor('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(valor('Permissions-Policy')).toContain('camera=()');
  });
});
