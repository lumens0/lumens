import { ORIGEM_SITE_PRODUCAO } from '@lumens/contratos';
import { z } from 'zod';

/**
 * Validação das variáveis de ambiente do back-end (SCRUM-75).
 *
 * O processo não sobe com ambiente incompleto: é melhor falhar na inicialização,
 * com o nome do que falta, do que descobrir a variável vazia no meio de uma
 * conversa do bot.
 */

const obrigatoria = z
  .string({ error: 'não definida — veja o .env.example' })
  .min(1, 'definida, porém vazia');

/**
 * Opcional de verdade: a chave pode estar ausente OU presente e vazia.
 * Depois de `cp .env.example .env` ela está presente e vazia, que é o caso comum.
 */
const opcional = z
  .string()
  .optional()
  .transform((valor) => (valor === undefined || valor === '' ? undefined : valor));

/** Ausente e vazia viram o padrão do esquema, pelo mesmo motivo de `opcional`. */
function comPadrao<T extends z.ZodType>(esquema: T) {
  return z.preprocess((valor) => (valor === '' ? undefined : valor), esquema);
}

/**
 * Chave de 32 bytes em base64 — o tamanho que o AES-256-GCM exige
 * (Roteiro da Parte 1, seção 6).
 *
 * O round-trip vem antes do teste de tamanho de propósito: o decodificador base64
 * do Node não reclama de entrada inválida, ele descarta em silêncio o que não
 * entende e decodifica o resto. Conferir só o tamanho deixaria passar uma chave
 * com espaço, quebra de linha ou em base64url — que decodifica para 32 bytes
 * DIFERENTES dos do CI. O sintoma seria dado cifrado numa máquina que não abre
 * na outra, com a validação jurando que está tudo certo.
 */
const chaveDe32Bytes = obrigatoria
  .refine(
    (valor) => Buffer.from(valor, 'base64').toString('base64') === valor,
    'não é base64 válido — confira se não entrou espaço, quebra de linha ou caractere trocado ao copiar',
  )
  .refine(
    (valor) => Buffer.from(valor, 'base64').length === 32,
    "precisa ter 32 bytes — gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
  );

/**
 * Lista de origens separadas por vírgula, cada uma no formato exato do header `Origin`
 * (esquema, host e porta; sem caminho nem barra final). Com barra final a origem nunca casaria
 * e o site ficaria sem CORS sem nenhum aviso; por isso a validação recusa.
 */
const origens = z
  .string()
  .transform((valor) =>
    valor
      .split(',')
      .map((origem) => origem.trim())
      .filter((origem) => origem !== ''),
  )
  .refine((lista) => lista.length > 0, 'precisa de pelo menos uma origem')
  .refine(
    (lista) => lista.every((origem) => URL.canParse(origem) && new URL(origem).origin === origem),
    'cada origem precisa ser esquema://host[:porta], sem caminho nem barra final — ex.: https://lumens-ufal.vercel.app',
  );

const esquema = z
  .object({
    // Servidor HTTP (webhook da Meta; a API entra no mesmo servidor)
    PORT: comPadrao(
      z.coerce
        .number({ error: 'não é um número — veja o .env.example' })
        .int()
        .positive()
        .default(3001),
    ),
    LOG_LEVEL: comPadrao(
      z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    ),

    // API de leitura: origens do site que podem chamá-la pelo navegador (CORS)
    CORS_ORIGENS: comPadrao(origens.default([ORIGEM_SITE_PRODUCAO])),

    // Banco
    DATABASE_URL: obrigatoria,
    DATABASE_URL_LEITURA: obrigatoria,
    DATABASE_URL_TESTE: opcional,

    // Criptografia (T17)
    CHAVE_CIFRA: chaveDe32Bytes,
    CHAVE_HMAC: chaveDe32Bytes,

    /**
     * O canal do bot nesta implantação: um só por processo. Só o webhook (ou polling), o sender de
     * respostas e o de avisos dele sobem. Vazio é o WhatsApp, como sempre foi.
     */
    CANAL_BOT: comPadrao(z.enum(['whatsapp', 'telegram']).default('whatsapp')),

    // WhatsApp / Meta (parte 2). Obrigatórias com CANAL_BOT=whatsapp; a regra fica no
    // `superRefine` abaixo.
    META_TOKEN: opcional,
    META_APP_SECRET: opcional,
    META_VERIFY_TOKEN: opcional,
    META_PHONE_NUMBER_ID: opcional,
    /**
     * Pessoas distintas que a Meta deixa o bot alcançar por 24h (RNF06). Começa em 250 e sobe
     * quando a Meta sobe o nível do portfólio; muda aqui, sem deploy de código.
     */
    META_LIMITE_PESSOAS: comPadrao(
      z.coerce
        .number({ error: 'não é um número — veja o .env.example' })
        .int()
        .positive()
        .default(250),
    ),

    /**
     * Por onde o WhatsApp sai, com CANAL_BOT=whatsapp (SCRUM-275): `meta` é a Cloud API acima;
     * `evolution` é o WhatsApp não oficial pela Evolution API, para a demonstração. Com
     * `evolution`, as variáveis META_* deixam de ser exigidas.
     */
    CANAL_WHATSAPP: comPadrao(z.enum(['meta', 'evolution']).default('meta')),
    /** Endereço interno da Evolution (`http://evolution:8080` no compose). Vazio no `pnpm dev` = respostas só no log. */
    EVOLUTION_URL: opcional.refine(
      (valor) => valor === undefined || URL.canParse(valor),
      'não é uma URL — ex.: http://evolution:8080',
    ),
    EVOLUTION_API_KEY: opcional,
    EVOLUTION_INSTANCIA: comPadrao(z.string().min(1).default('lumens')),
    /** Segredo que a Evolution manda no header `Authorization: Bearer ...` do webhook. */
    EVOLUTION_WEBHOOK_SEGREDO: opcional.refine(
      (valor) => valor === undefined || valor.length >= 32,
      'precisa de pelo menos 32 caracteres — gere com: openssl rand -hex 32',
    ),
    /** Pessoas distintas que recebem aviso por 24h. Bem abaixo da Meta: número novo é frágil. */
    EVOLUTION_LIMITE_PESSOAS: comPadrao(z.coerce.number().int().positive().default(30)),
    /** Avisos por lote (um lote por minuto). */
    EVOLUTION_AVISOS_POR_LOTE: comPadrao(z.coerce.number().int().positive().default(2)),
    /** Intervalo aleatório entre dois avisos, em segundos. */
    EVOLUTION_INTERVALO_MIN_S: comPadrao(z.coerce.number().int().nonnegative().default(20)),
    EVOLUTION_INTERVALO_MAX_S: comPadrao(z.coerce.number().int().nonnegative().default(45)),

    // Telegram: obrigatório com CANAL_BOT=telegram.
    TELEGRAM_BOT_TOKEN: opcional,
    /** Conferido no header `X-Telegram-Bot-Api-Secret-Token` do webhook. */
    TELEGRAM_WEBHOOK_SECRET: opcional.refine(
      (valor) => valor === undefined || /^[A-Za-z0-9_-]{1,256}$/.test(valor),
      'só letras, números, _ e -, até 256 caracteres (regra do Telegram para o secret_token)',
    ),
    /** `polling` é para a máquina do dev: busca as mensagens sem precisar de túnel. */
    TELEGRAM_MODO: comPadrao(z.enum(['webhook', 'polling']).default('webhook')),

    // E-mail do código de verificação
    EMAIL_HOST: obrigatoria,
    EMAIL_PORT: z.coerce
      .number({ error: 'não definida ou não é um número — veja o .env.example' })
      .int()
      .positive(),
    EMAIL_USUARIO: obrigatoria,
    EMAIL_SENHA: obrigatoria,
    EMAIL_REMETENTE: obrigatoria,

    // AWS / fotos (T20)
    AWS_REGION: obrigatoria,
    S3_BUCKET_FOTOS: obrigatoria,
    S3_ENDPOINT: opcional,
  })
  .refine((env) => env.CHAVE_CIFRA !== env.CHAVE_HMAC, {
    message:
      'precisa ser DIFERENTE de CHAVE_CIFRA — uma cifra os dados, a outra gera o HMAC de busca; reusar a mesma elimina essa separação',
    path: ['CHAVE_HMAC'],
  })
  .superRefine(validarCanais, { when: () => true });

const VARIAVEIS_META = [
  'META_TOKEN',
  'META_APP_SECRET',
  'META_VERIFY_TOKEN',
  'META_PHONE_NUMBER_ID',
] as const;

/**
 * As variáveis do canal ativo são obrigatórias; as do outro canal são ignoradas. No Telegram em
 * modo `webhook`, o secret token também é obrigatório: sem ele, qualquer um poderia mandar updates.
 *
 * Roda mesmo com outras variáveis inválidas (`when`), para a mensagem listar tudo de uma vez.
 */
function validarCanais(
  env: Partial<
    Record<
      | (typeof VARIAVEIS_META)[number]
      | 'CANAL_BOT'
      | 'TELEGRAM_BOT_TOKEN'
      | 'TELEGRAM_WEBHOOK_SECRET'
      | 'TELEGRAM_MODO'
      | 'CANAL_WHATSAPP'
      | 'EVOLUTION_URL'
      | 'EVOLUTION_API_KEY'
      | 'EVOLUTION_WEBHOOK_SEGREDO',
      string | undefined
    >
  > & { EVOLUTION_INTERVALO_MIN_S?: number; EVOLUTION_INTERVALO_MAX_S?: number },
  ctx: z.RefinementCtx,
): void {
  if (env.CANAL_BOT === 'telegram') {
    if (env.TELEGRAM_BOT_TOKEN === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'obrigatória com CANAL_BOT=telegram — veja o .env.example',
        path: ['TELEGRAM_BOT_TOKEN'],
      });
    }
    if (env.TELEGRAM_MODO !== 'polling' && env.TELEGRAM_WEBHOOK_SECRET === undefined) {
      ctx.addIssue({
        code: 'custom',
        message:
          "obrigatória com TELEGRAM_MODO=webhook — gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
        path: ['TELEGRAM_WEBHOOK_SECRET'],
      });
    }
    return;
  }
  if (env.CANAL_WHATSAPP === 'evolution') {
    validarEvolution(env, ctx);
    return;
  }
  for (const nome of VARIAVEIS_META) {
    if (env[nome] === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'não definida — veja o .env.example (ou use CANAL_BOT=telegram)',
        path: [nome],
      });
    }
  }
}

/**
 * WhatsApp pela Evolution (SCRUM-275). O segredo do webhook é sempre exigido: sem ele a rota
 * recusaria tudo, até o `pnpm sim`. URL e chave vão juntas; as duas vazias só servem no `pnpm dev`
 * (o `criarCanalEvolution` recusa subir assim fora dele).
 */
function validarEvolution(env: Parameters<typeof validarCanais>[0], ctx: z.RefinementCtx): void {
  if (env.EVOLUTION_WEBHOOK_SEGREDO === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'obrigatória com CANAL_WHATSAPP=evolution — gere com: openssl rand -hex 32',
      path: ['EVOLUTION_WEBHOOK_SEGREDO'],
    });
  }
  if ((env.EVOLUTION_URL === undefined) !== (env.EVOLUTION_API_KEY === undefined)) {
    ctx.addIssue({
      code: 'custom',
      message:
        'EVOLUTION_URL e EVOLUTION_API_KEY vão juntas: as duas preenchidas ou as duas vazias',
      path: [env.EVOLUTION_URL === undefined ? 'EVOLUTION_URL' : 'EVOLUTION_API_KEY'],
    });
  }
  const { EVOLUTION_INTERVALO_MIN_S: min, EVOLUTION_INTERVALO_MAX_S: max } = env;
  if (min !== undefined && max !== undefined && min > max) {
    ctx.addIssue({
      code: 'custom',
      message: 'não pode ser menor que EVOLUTION_INTERVALO_MIN_S',
      path: ['EVOLUTION_INTERVALO_MAX_S'],
    });
  }
}

export type Env = z.infer<typeof esquema>;

/** O WhatsApp (Cloud API da Meta). */
export interface ConfigWhatsApp {
  token: string;
  appSecret: string;
  verifyToken: string;
  phoneNumberId: string;
  /** Pessoas distintas por 24h que a Meta permite (RNF06). */
  limitePessoas: number;
}

/** O Telegram. */
export interface ConfigTelegram {
  token: string;
  modo: 'webhook' | 'polling';
  /** Só falta no modo `polling`: o `carregarEnv` exige no `webhook`. */
  segredoDoWebhook?: string;
}

/** O WhatsApp pela Evolution API (`CANAL_WHATSAPP=evolution`, SCRUM-275). */
export interface ConfigEvolution {
  /** Sem URL e chave (só no `pnpm dev`), as respostas e os avisos vão para o log. */
  url?: string;
  apiKey?: string;
  instancia: string;
  segredoDoWebhook: string;
  /** Pessoas distintas por 24h que recebem aviso. */
  limitePessoas: number;
  avisosPorLote: number;
  intervaloMinMs: number;
  intervaloMaxMs: number;
}

/** O canal ativo (`CANAL_BOT`) com a configuração dele. As variáveis do outro canal ficam de fora. */
export type ConfigDoCanal =
  | ({ canal: 'whatsapp' } & ConfigWhatsApp)
  | ({ canal: 'whatsapp-evolution' } & ConfigEvolution)
  | ({ canal: 'telegram' } & ConfigTelegram);

export function canalDoEnv(env: Env): ConfigDoCanal {
  if (env.CANAL_BOT === 'whatsapp' && env.CANAL_WHATSAPP === 'evolution') {
    // O `carregarEnv` já recusou o ambiente sem o segredo.
    if (env.EVOLUTION_WEBHOOK_SEGREDO === undefined) {
      throw new Error('EVOLUTION_WEBHOOK_SEGREDO não definida.');
    }
    return {
      canal: 'whatsapp-evolution',
      ...(env.EVOLUTION_URL === undefined ? {} : { url: env.EVOLUTION_URL }),
      ...(env.EVOLUTION_API_KEY === undefined ? {} : { apiKey: env.EVOLUTION_API_KEY }),
      instancia: env.EVOLUTION_INSTANCIA,
      segredoDoWebhook: env.EVOLUTION_WEBHOOK_SEGREDO,
      limitePessoas: env.EVOLUTION_LIMITE_PESSOAS,
      avisosPorLote: env.EVOLUTION_AVISOS_POR_LOTE,
      intervaloMinMs: env.EVOLUTION_INTERVALO_MIN_S * 1000,
      intervaloMaxMs: env.EVOLUTION_INTERVALO_MAX_S * 1000,
    };
  }
  if (env.CANAL_BOT === 'telegram') {
    // O `carregarEnv` já recusou o ambiente sem o token.
    if (env.TELEGRAM_BOT_TOKEN === undefined) throw new Error('TELEGRAM_BOT_TOKEN não definida.');
    return {
      canal: 'telegram',
      token: env.TELEGRAM_BOT_TOKEN,
      modo: env.TELEGRAM_MODO,
      ...(env.TELEGRAM_WEBHOOK_SECRET === undefined
        ? {}
        : { segredoDoWebhook: env.TELEGRAM_WEBHOOK_SECRET }),
    };
  }
  const { META_TOKEN, META_APP_SECRET, META_VERIFY_TOKEN, META_PHONE_NUMBER_ID } = env;
  if (
    META_TOKEN === undefined ||
    META_APP_SECRET === undefined ||
    META_VERIFY_TOKEN === undefined ||
    META_PHONE_NUMBER_ID === undefined
  ) {
    throw new Error('META_* não definidas.');
  }
  return {
    canal: 'whatsapp',
    token: META_TOKEN,
    appSecret: META_APP_SECRET,
    verifyToken: META_VERIFY_TOKEN,
    phoneNumberId: META_PHONE_NUMBER_ID,
    limitePessoas: env.META_LIMITE_PESSOAS,
  };
}

export type FonteDeAmbiente = Record<string, string | undefined>;

/**
 * Lê e valida o ambiente. Recebe a fonte por parâmetro para que os testes não
 * precisem mexer no `process.env` do processo que está rodando.
 *
 * Quem popula o `process.env` a partir do `.env` é o `--env-file-if-exists` do
 * Node, no script `dev` — esta função não lê arquivo nenhum.
 *
 * @throws {Error} listando TODAS as variáveis com problema, não só a primeira.
 */
export function carregarEnv(fonte: FonteDeAmbiente = process.env): Env {
  const resultado = esquema.safeParse(fonte);

  if (resultado.success) {
    return resultado.data;
  }

  const problemas = resultado.error.issues.map((problema) => {
    const nome = problema.path.length > 0 ? problema.path.join('.') : '(ambiente)';
    return `  - ${nome}: ${problema.message}`;
  });

  throw new Error(
    [
      'Ambiente inválido. Corrija as variáveis abaixo e rode de novo:',
      '',
      ...problemas,
      '',
      'Se este é um ambiente novo: cp .env.example .env e preencha o .env.',
    ].join('\n'),
  );
}
