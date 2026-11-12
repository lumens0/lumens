import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMANDO_NOVA_PAUTA,
  comandoAjudar,
  comandoApoiar,
  canalDoBot,
  exigirBotDoCanal,
  exigirNumeroDoBot,
  linkDoBot,
  linkTelegram,
  linkWhatsApp,
  nomeDoCanal,
  payloadTelegram,
} from './whatsapp';

// Slug real gerado pelo domínio: título de 60 caracteres + `-` + 8 do id = 69 caracteres.
const SLUG_LONGO = `${'a'.repeat(60)}-1a2b3c4d`;

describe('canalDoBot', () => {
  it('vazio ou ausente é whatsapp', () => {
    expect(canalDoBot(undefined)).toBe('whatsapp');
    expect(canalDoBot('')).toBe('whatsapp');
    expect(canalDoBot(' ')).toBe('whatsapp');
  });

  it('aceita whatsapp e telegram, sem diferenciar maiúsculas', () => {
    expect(canalDoBot('whatsapp')).toBe('whatsapp');
    expect(canalDoBot(' Telegram ')).toBe('telegram');
  });

  it('valor desconhecido é null', () => {
    expect(canalDoBot('signal')).toBeNull();
  });
});

describe('payloadTelegram', () => {
  it('codifica os três comandos', () => {
    expect(payloadTelegram(comandoApoiar('bebedouros-no-bloco-18'))).toBe(
      'apoiar_bebedouros-no-bloco-18',
    );
    expect(payloadTelegram(comandoAjudar('faixa-do-bloco-18'))).toBe('ajudar_faixa-do-bloco-18');
    expect(payloadTelegram(COMANDO_NOVA_PAUTA)).toBe('nova');
  });

  it('aceita até 64 caracteres e recusa acima', () => {
    const cabe = 'a'.repeat(64 - 'apoiar_'.length);
    expect(payloadTelegram(comandoApoiar(cabe))).toBe(`apoiar_${cabe}`);
    expect(payloadTelegram(comandoApoiar(`${cabe}b`))).toBeNull();
    expect(payloadTelegram(comandoApoiar(SLUG_LONGO))).toBeNull();
  });

  it('recusa caractere fora de A-Z a-z 0-9 _ -', () => {
    expect(payloadTelegram(comandoApoiar('iluminação'))).toBeNull();
    expect(payloadTelegram(comandoAjudar('a.b'))).toBeNull();
    expect(payloadTelegram(comandoApoiar(''))).toBeNull();
  });

  it('recusa comando que o bot não decodifica', () => {
    expect(payloadTelegram('sair')).toBeNull();
  });
});

describe('linkTelegram', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sem usuário configurado devolve null', () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT', undefined);
    expect(linkTelegram('nova pauta')).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT', ' @ ');
    expect(linkTelegram()).toBeNull();
  });

  it('monta o start dos três comandos e tira o @ do usuário', () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT', '@LumensBot');
    expect(linkTelegram(comandoApoiar('bebedouros-no-bloco-18'))).toBe(
      'https://t.me/LumensBot?start=apoiar_bebedouros-no-bloco-18',
    );
    expect(linkTelegram(comandoAjudar('faixa'))).toBe('https://t.me/LumensBot?start=ajudar_faixa');
    expect(linkTelegram(COMANDO_NOVA_PAUTA)).toBe('https://t.me/LumensBot?start=nova');
    expect(linkTelegram()).toBe('https://t.me/LumensBot');
  });

  it('comando que não cabe no start abre o bot sem comando', () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT', 'LumensBot');
    expect(linkTelegram(comandoApoiar(SLUG_LONGO))).toBe('https://t.me/LumensBot');
  });
});

describe('linkDoBot', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '5582999999999');
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT', 'LumensBot');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sem canal configurado usa o WhatsApp', () => {
    vi.stubEnv('NEXT_PUBLIC_CANAL_BOT', undefined);
    expect(linkDoBot(comandoApoiar('x'))).toBe('https://wa.me/5582999999999?text=apoiar%20x');
    expect(linkDoBot(comandoAjudar('x'))).toBe('https://wa.me/5582999999999?text=ajudar%20x');
    expect(linkDoBot(COMANDO_NOVA_PAUTA)).toBe('https://wa.me/5582999999999?text=nova%20pauta');
    expect(nomeDoCanal()).toBe('WhatsApp');
  });

  it('com canal telegram usa o t.me', () => {
    vi.stubEnv('NEXT_PUBLIC_CANAL_BOT', 'telegram');
    expect(linkDoBot(comandoApoiar('x'))).toBe('https://t.me/LumensBot?start=apoiar_x');
    expect(linkDoBot(comandoAjudar('x'))).toBe('https://t.me/LumensBot?start=ajudar_x');
    expect(linkDoBot(COMANDO_NOVA_PAUTA)).toBe('https://t.me/LumensBot?start=nova');
    expect(nomeDoCanal()).toBe('Telegram');
  });

  it('sem bot no canal ativo devolve null, mesmo com o outro configurado', () => {
    vi.stubEnv('NEXT_PUBLIC_CANAL_BOT', 'telegram');
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT', '');
    expect(linkDoBot(COMANDO_NOVA_PAUTA)).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_CANAL_BOT', 'whatsapp');
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT', 'LumensBot');
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '');
    expect(linkDoBot(COMANDO_NOVA_PAUTA)).toBeNull();
  });

  it('canal desconhecido devolve null', () => {
    vi.stubEnv('NEXT_PUBLIC_CANAL_BOT', 'signal');
    expect(linkDoBot(COMANDO_NOVA_PAUTA)).toBeNull();
  });
});

describe('exigirBotDoCanal', () => {
  it('whatsapp (padrão) exige o número', () => {
    expect(() => exigirBotDoCanal({ canal: '', whatsapp: '', telegram: 'LumensBot' })).toThrow(
      /NEXT_PUBLIC_WHATSAPP_BOT não configurada/,
    );
    expect(exigirBotDoCanal({ canal: undefined, whatsapp: '55', telegram: undefined })).toBe(
      'whatsapp',
    );
  });

  it('telegram exige o usuário, não o número', () => {
    expect(() =>
      exigirBotDoCanal({ canal: 'telegram', whatsapp: '5582999999999', telegram: '' }),
    ).toThrow(/NEXT_PUBLIC_TELEGRAM_BOT não configurada/);
    expect(exigirBotDoCanal({ canal: 'telegram', whatsapp: '', telegram: '@LumensBot' })).toBe(
      'telegram',
    );
  });

  it('canal desconhecido falha', () => {
    expect(() =>
      exigirBotDoCanal({ canal: 'signal', whatsapp: '55', telegram: 'LumensBot' }),
    ).toThrow(/NEXT_PUBLIC_CANAL_BOT inválida/);
  });
});

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
    expect(comandoAjudar('faixa-do-bloco-18')).toBe('ajudar faixa-do-bloco-18');
    expect(COMANDO_NOVA_PAUTA).toBe('nova pauta');
  });
});

describe('exigirNumeroDoBot', () => {
  it('falha com mensagem clara sem dígitos', () => {
    for (const valor of [undefined, '', ' + ']) {
      expect(() => exigirNumeroDoBot(valor)).toThrow(/NEXT_PUBLIC_WHATSAPP_BOT não configurada/);
    }
  });

  it('devolve só os dígitos', () => {
    expect(exigirNumeroDoBot('+55 82 99999-9999')).toBe('5582999999999');
  });
});
