import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMANDO_NOVA_PAUTA, comandoAjudar, comandoApoiar, linkWhatsApp } from './whatsapp';

describe('linkWhatsApp', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sem número configurado devolve null', () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', undefined);
    expect(linkWhatsApp('apoiar x')).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '');
    expect(linkWhatsApp()).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', ' + ');
    expect(linkWhatsApp()).toBeNull();
  });

  it('mantém só os dígitos do número', () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '+55 82 99999-9999');
    expect(linkWhatsApp()).toBe('https://wa.me/5582999999999');
  });

  it('codifica espaços e acentos no texto', () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '5582999999999');
    expect(linkWhatsApp('apoiar iluminação já')).toBe(
      'https://wa.me/5582999999999?text=apoiar%20ilumina%C3%A7%C3%A3o%20j%C3%A1',
    );
    expect(linkWhatsApp('a&b=c')).toBe('https://wa.me/5582999999999?text=a%26b%3Dc');
  });

  it('monta os comandos do bot', () => {
    expect(comandoApoiar('bebedouros-no-bloco-18')).toBe('apoiar bebedouros-no-bloco-18');
    expect(comandoAjudar('c1')).toBe('ajudar c1');
    expect(COMANDO_NOVA_PAUTA).toBe('nova pauta');
  });
});
