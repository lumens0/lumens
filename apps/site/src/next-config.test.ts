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
    expect(config(PHASE_PRODUCTION_BUILD)).toEqual({ agentRules: false });
  });

  it('next dev sem número não falha', () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '');
    expect(config(PHASE_DEVELOPMENT_SERVER)).toEqual({ agentRules: false });
  });
});
