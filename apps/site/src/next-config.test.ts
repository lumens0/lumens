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
});
