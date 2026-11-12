import { describe, expect, it, vi } from 'vitest';
import { carregarEnv, telegramDoEnv, whatsappDoEnv, type FonteDeAmbiente } from './env';

const CHAVE_A = Buffer.alloc(32, 1).toString('base64');
const CHAVE_B = Buffer.alloc(32, 2).toString('base64');

function ambienteCompleto(): FonteDeAmbiente {
  return {
    DATABASE_URL: 'postgresql://lumens:senha@localhost:5432/lumens',
    DATABASE_URL_LEITURA: 'postgresql://leitura:senha@localhost:5432/lumens',
    CHAVE_CIFRA: CHAVE_A,
    CHAVE_HMAC: CHAVE_B,
    META_TOKEN: 'token',
    META_APP_SECRET: 'segredo',
    META_VERIFY_TOKEN: 'frase',
    META_PHONE_NUMBER_ID: '1234567890',
    EMAIL_HOST: 'smtp.exemplo.com',
    EMAIL_PORT: '587',
    EMAIL_USUARIO: 'usuario',
    EMAIL_SENHA: 'senha',
    EMAIL_REMETENTE: 'lumens@exemplo.com',
    AWS_REGION: 'us-east-1',
    S3_BUCKET_FOTOS: 'lumens-fotos',
  };
}

function mensagemDeErro(fonte: FonteDeAmbiente): string {
  try {
    carregarEnv(fonte);
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro);
  }
  throw new Error('esperava que carregarEnv lançasse, mas ela retornou');
}

describe('carregarEnv', () => {
  it('aceita um ambiente completo e converte a porta para número', () => {
    const env = carregarEnv(ambienteCompleto());

    expect(env.EMAIL_PORT).toBe(587);
    expect(env.DATABASE_URL).toBe('postgresql://lumens:senha@localhost:5432/lumens');
  });

  it('usa process.env quando nenhuma fonte é passada — o caminho que o main.ts percorre', () => {
    // stubEnv mexe só nas chaves: trocar o objeto process.env inteiro apagaria
    // PATH e companhia para o worker, e viraria flake se os testes rodarem em paralelo.
    for (const [chave, valor] of Object.entries(ambienteCompleto())) {
      vi.stubEnv(chave, valor ?? '');
    }
    try {
      expect(carregarEnv().EMAIL_PORT).toBe(587);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('nomeia a variável que está faltando', () => {
    const { DATABASE_URL: _removida, ...semBanco } = ambienteCompleto();

    // Com dois-pontos para não casar por prefixo com DATABASE_URL_LEITURA.
    expect(mensagemDeErro(semBanco)).toContain('DATABASE_URL:');
  });

  it('lista todas as variáveis faltantes de uma vez, não só a primeira', () => {
    const { META_TOKEN: _a, EMAIL_HOST: _b, AWS_REGION: _c, ...incompleto } = ambienteCompleto();

    const mensagem = mensagemDeErro(incompleto);

    expect(mensagem).toContain('META_TOKEN');
    expect(mensagem).toContain('EMAIL_HOST');
    expect(mensagem).toContain('AWS_REGION');
  });

  it('recusa variável presente mas vazia', () => {
    expect(mensagemDeErro({ ...ambienteCompleto(), META_APP_SECRET: '' })).toContain(
      'META_APP_SECRET',
    );
  });

  it('recusa EMAIL_PORT que não é número', () => {
    expect(mensagemDeErro({ ...ambienteCompleto(), EMAIL_PORT: 'quinhentos' })).toContain(
      'EMAIL_PORT',
    );
  });

  it('recusa EMAIL_PORT zero ou negativa', () => {
    expect(mensagemDeErro({ ...ambienteCompleto(), EMAIL_PORT: '0' })).toContain('EMAIL_PORT');
  });

  it('recusa ambiente sem CHAVE_CIFRA ou sem CHAVE_HMAC', () => {
    const { CHAVE_CIFRA: _a, ...semCifra } = ambienteCompleto();
    const { CHAVE_HMAC: _b, ...semHmac } = ambienteCompleto();

    expect(mensagemDeErro(semCifra)).toContain('CHAVE_CIFRA:');
    expect(mensagemDeErro(semHmac)).toContain('CHAVE_HMAC:');
  });

  it('recusa chave de cifra que não tem 32 bytes', () => {
    const curta = Buffer.alloc(16, 9).toString('base64');

    expect(mensagemDeErro({ ...ambienteCompleto(), CHAVE_CIFRA: curta })).toContain('CHAVE_CIFRA');
  });

  it('recusa chave com lixo fora do alfabeto base64, mesmo que decodifique para 32 bytes', () => {
    // O Node descarta os caracteres inválidos em silêncio: este valor decodifica
    // para 32 bytes, mas não é o base64 que o dev colou no CI.
    const comLixo = `!!!${CHAVE_A}`;
    expect(Buffer.from(comLixo, 'base64')).toHaveLength(32);

    expect(mensagemDeErro({ ...ambienteCompleto(), CHAVE_CIFRA: comLixo })).toContain(
      'não é base64 válido',
    );
  });

  it('recusa chave com quebra de linha colada junto', () => {
    const comQuebra = `${CHAVE_A}\n`;

    expect(mensagemDeErro({ ...ambienteCompleto(), CHAVE_HMAC: comQuebra })).toContain(
      'não é base64 válido',
    );
  });

  it('recusa CHAVE_HMAC igual à CHAVE_CIFRA', () => {
    expect(mensagemDeErro({ ...ambienteCompleto(), CHAVE_HMAC: CHAVE_A })).toContain('DIFERENTE');
  });

  it('trata opcional ausente e opcional vazia da mesma forma', () => {
    const semChave = carregarEnv(ambienteCompleto());
    const chaveVazia = carregarEnv({
      ...ambienteCompleto(),
      S3_ENDPOINT: '',
      DATABASE_URL_TESTE: '',
    });

    expect(semChave.S3_ENDPOINT).toBeUndefined();
    // Depois de `cp .env.example .env` a chave existe e está vazia: tem de virar undefined.
    expect(chaveVazia.S3_ENDPOINT).toBeUndefined();
    expect(chaveVazia.DATABASE_URL_TESTE).toBeUndefined();
  });

  it('usa PORT 3001 e LOG_LEVEL info quando ausentes ou vazios', () => {
    for (const fonte of [ambienteCompleto(), { ...ambienteCompleto(), PORT: '', LOG_LEVEL: '' }]) {
      const env = carregarEnv(fonte);
      expect(env.PORT).toBe(3001);
      expect(env.LOG_LEVEL).toBe('info');
    }
  });

  it('converte PORT para número', () => {
    expect(carregarEnv({ ...ambienteCompleto(), PORT: '8080' }).PORT).toBe(8080);
  });

  it('recusa PORT que não é número', () => {
    expect(mensagemDeErro({ ...ambienteCompleto(), PORT: 'oitenta' })).toContain('PORT');
  });

  it('recusa LOG_LEVEL fora da lista do pino', () => {
    expect(mensagemDeErro({ ...ambienteCompleto(), LOG_LEVEL: 'verbose' })).toContain('LOG_LEVEL');
  });

  it('usa a origem do site em produção quando CORS_ORIGENS está ausente ou vazia', () => {
    for (const fonte of [ambienteCompleto(), { ...ambienteCompleto(), CORS_ORIGENS: '' }]) {
      expect(carregarEnv(fonte).CORS_ORIGENS).toEqual(['https://lumens-ufal.vercel.app']);
    }
  });

  it('separa CORS_ORIGENS por vírgula e ignora espaços', () => {
    const env = carregarEnv({
      ...ambienteCompleto(),
      CORS_ORIGENS: 'http://localhost:3000, https://lumens-ufal.vercel.app',
    });

    expect(env.CORS_ORIGENS).toEqual(['http://localhost:3000', 'https://lumens-ufal.vercel.app']);
  });

  it.each([
    'https://lumens-ufal.vercel.app/',
    'lumens-ufal.vercel.app',
    'https://x.app/pautas',
    ',',
  ])('recusa CORS_ORIGENS que nunca casaria com o header Origin (%s)', (valor) => {
    expect(mensagemDeErro({ ...ambienteCompleto(), CORS_ORIGENS: valor })).toContain(
      'CORS_ORIGENS',
    );
  });

  it('preserva opcional preenchida', () => {
    const env = carregarEnv({ ...ambienteCompleto(), S3_ENDPOINT: 'http://localhost:9000' });

    expect(env.S3_ENDPOINT).toBe('http://localhost:9000');
  });
});

describe('canais do bot (WhatsApp e Telegram)', () => {
  const META = ['META_TOKEN', 'META_APP_SECRET', 'META_VERIFY_TOKEN', 'META_PHONE_NUMBER_ID'];
  const semMeta = (): FonteDeAmbiente => {
    const fonte = ambienteCompleto();
    for (const nome of META) fonte[nome] = '';
    return fonte;
  };
  const TELEGRAM = { TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_WEBHOOK_SECRET: 'segredo_1-a' };

  it('só a Meta: WhatsApp ligado, Telegram desligado', () => {
    const env = carregarEnv(ambienteCompleto());
    expect(whatsappDoEnv(env)).toEqual({
      token: 'token',
      appSecret: 'segredo',
      verifyToken: 'frase',
      phoneNumberId: '1234567890',
    });
    expect(telegramDoEnv(env)).toBeUndefined();
  });

  it('só o Telegram: as META_* deixam de ser obrigatórias; o modo padrão é webhook', () => {
    const env = carregarEnv({ ...semMeta(), ...TELEGRAM });
    expect(whatsappDoEnv(env)).toBeUndefined();
    expect(telegramDoEnv(env)).toEqual({
      token: '123:abc',
      modo: 'webhook',
      segredoDoWebhook: 'segredo_1-a',
    });
  });

  it('nenhum canal: recusa e nomeia as META_*', () => {
    const mensagem = mensagemDeErro(semMeta());
    for (const nome of META) expect(mensagem).toContain(`${nome}:`);
    expect(mensagem).toContain('TELEGRAM_BOT_TOKEN');
  });

  it('com o Telegram, WhatsApp pela metade é recusado', () => {
    const metade: FonteDeAmbiente = { ...ambienteCompleto(), ...TELEGRAM, META_TOKEN: undefined };
    expect(mensagemDeErro(metade)).toContain('META_TOKEN: o WhatsApp está configurado pela metade');
  });

  it('webhook do Telegram sem segredo é recusado; polling não precisa dele', () => {
    expect(mensagemDeErro({ ...semMeta(), TELEGRAM_BOT_TOKEN: '1:a' })).toContain(
      'TELEGRAM_WEBHOOK_SECRET',
    );
    const env = carregarEnv({ ...semMeta(), TELEGRAM_BOT_TOKEN: '1:a', TELEGRAM_MODO: 'polling' });
    expect(telegramDoEnv(env)).toEqual({ token: '1:a', modo: 'polling' });
  });

  it('recusa TELEGRAM_MODO desconhecido e segredo com caractere que o Telegram não aceita', () => {
    expect(mensagemDeErro({ ...ambienteCompleto(), ...TELEGRAM, TELEGRAM_MODO: 'push' })).toContain(
      'TELEGRAM_MODO',
    );
    expect(
      mensagemDeErro({ ...ambienteCompleto(), ...TELEGRAM, TELEGRAM_WEBHOOK_SECRET: 'com espaço' }),
    ).toContain('TELEGRAM_WEBHOOK_SECRET');
  });

  it('lista o problema de canal junto com os outros', () => {
    const { EMAIL_HOST: _e, ...fonte } = semMeta();
    const mensagem = mensagemDeErro(fonte);
    expect(mensagem).toContain('EMAIL_HOST');
    expect(mensagem).toContain('META_TOKEN');
  });
});
