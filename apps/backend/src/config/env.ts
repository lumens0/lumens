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

    // WhatsApp / Meta (parte 2). Obrigatórias sem o Telegram; com ele, opcionais (as quatro ou
    // nenhuma). A regra fica no `superRefine` abaixo.
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

    // Telegram: o segundo canal do bot. Ligado se e só se o token estiver definido.
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
 * Pelo menos um canal. Sem o Telegram, as quatro `META_*` são obrigatórias, como sempre foram. Com
 * ele, o WhatsApp é opcional, mas pela metade não: faltar uma das quatro seria o webhook da Meta
 * no ar recusando tudo, ou respostas que nunca saem, sem nenhum aviso.
 *
 * Roda mesmo com outras variáveis inválidas (`when`), para a mensagem listar tudo de uma vez.
 */
function validarCanais(
  env: Partial<
    Record<
      | (typeof VARIAVEIS_META)[number]
      | 'TELEGRAM_BOT_TOKEN'
      | 'TELEGRAM_WEBHOOK_SECRET'
      | 'TELEGRAM_MODO',
      string | undefined
    >
  >,
  ctx: z.RefinementCtx,
): void {
  const faltando = VARIAVEIS_META.filter((nome) => env[nome] === undefined);
  const comTelegram = env.TELEGRAM_BOT_TOKEN !== undefined;
  if (!comTelegram || faltando.length < VARIAVEIS_META.length) {
    const mensagem = comTelegram
      ? 'o WhatsApp está configurado pela metade — defina as quatro META_* ou nenhuma (com o Telegram ligado)'
      : 'não definida — veja o .env.example (ou ligue o Telegram com TELEGRAM_BOT_TOKEN)';
    for (const nome of faltando) ctx.addIssue({ code: 'custom', message: mensagem, path: [nome] });
  }
  if (comTelegram && env.TELEGRAM_MODO !== 'polling' && env.TELEGRAM_WEBHOOK_SECRET === undefined) {
    ctx.addIssue({
      code: 'custom',
      message:
        "obrigatória com TELEGRAM_MODO=webhook — gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      path: ['TELEGRAM_WEBHOOK_SECRET'],
    });
  }
}

export type Env = z.infer<typeof esquema>;

/** O WhatsApp (Cloud API da Meta), quando as quatro `META_*` estão definidas. */
export interface ConfigWhatsApp {
  token: string;
  appSecret: string;
  verifyToken: string;
  phoneNumberId: string;
}

export function whatsappDoEnv(env: Env): ConfigWhatsApp | undefined {
  const { META_TOKEN, META_APP_SECRET, META_VERIFY_TOKEN, META_PHONE_NUMBER_ID } = env;
  if (
    META_TOKEN === undefined ||
    META_APP_SECRET === undefined ||
    META_VERIFY_TOKEN === undefined ||
    META_PHONE_NUMBER_ID === undefined
  ) {
    return undefined;
  }
  return {
    token: META_TOKEN,
    appSecret: META_APP_SECRET,
    verifyToken: META_VERIFY_TOKEN,
    phoneNumberId: META_PHONE_NUMBER_ID,
  };
}

/** O Telegram, quando o `TELEGRAM_BOT_TOKEN` está definido. */
export interface ConfigTelegram {
  token: string;
  modo: 'webhook' | 'polling';
  /** Só falta no modo `polling`: o `carregarEnv` exige no `webhook`. */
  segredoDoWebhook?: string;
}

export function telegramDoEnv(env: Env): ConfigTelegram | undefined {
  if (env.TELEGRAM_BOT_TOKEN === undefined) return undefined;
  return {
    token: env.TELEGRAM_BOT_TOKEN,
    modo: env.TELEGRAM_MODO,
    ...(env.TELEGRAM_WEBHOOK_SECRET === undefined
      ? {}
      : { segredoDoWebhook: env.TELEGRAM_WEBHOOK_SECRET }),
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
