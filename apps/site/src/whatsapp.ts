/**
 * Links do bot do Lumens: wa.me (WhatsApp, padrão) ou t.me (Telegram, canal reserva). O site não
 * registra nada: só abre a conversa com o comando já digitado, e quem interpreta o comando é o bot
 * (2.7, SCRUM-102). O canal vem de `NEXT_PUBLIC_CANAL_BOT`, fixado no build.
 */

/** Comando de apoio. O identificador é o slug público da pauta, o mesmo da URL `/p/<slug>`. */
export function comandoApoiar(slug: string): string {
  return `apoiar ${slug}`;
}

/** Comando de voluntariado na proposta aberta da pauta (3.5, SCRUM-197). Também pelo slug. */
export function comandoAjudar(slug: string): string {
  return `ajudar ${slug}`;
}

export const COMANDO_NOVA_PAUTA = 'nova pauta';

export const CANAIS_DO_BOT = ['whatsapp', 'telegram'] as const;
export type CanalDoBot = (typeof CANAIS_DO_BOT)[number];

/** Canal de `NEXT_PUBLIC_CANAL_BOT`. Vazio é `whatsapp`; valor desconhecido é `null`. */
export function canalDoBot(valor: string | undefined): CanalDoBot | null {
  const canal = (valor ?? '').trim().toLowerCase();
  if (canal === '') return 'whatsapp';
  return (CANAIS_DO_BOT as readonly string[]).includes(canal) ? (canal as CanalDoBot) : null;
}

/** Canal ativo no build. Lido literalmente: o Next só embute `process.env.NEXT_PUBLIC_*` por extenso. */
export function canalAtivo(): CanalDoBot | null {
  return canalDoBot(process.env.NEXT_PUBLIC_CANAL_BOT);
}

/** Nome do canal ativo para o texto do site ("pelo WhatsApp", "pelo Telegram"). */
export function nomeDoCanal(): string {
  return canalAtivo() === 'telegram' ? 'Telegram' : 'WhatsApp';
}

/**
 * Link do bot no canal ativo, com o comando opcional. Devolve `null` sem bot configurado no canal
 * (ou com canal desconhecido): quem chama esconde o botão.
 */
export function linkDoBot(comando?: string): string | null {
  switch (canalAtivo()) {
    case 'whatsapp':
      return linkWhatsApp(comando);
    case 'telegram':
      return linkTelegram(comando);
    default:
      return null;
  }
}

/**
 * Link wa.me do bot, com o comando opcional no `text`. Devolve `null` sem número configurado: quem
 * chama esconde o botão.
 */
export function linkWhatsApp(comando?: string): string | null {
  // Lido literalmente: o Next só embute no bundle `process.env.NEXT_PUBLIC_*` escrito por extenso.
  const numero = numeroDoBot(process.env.NEXT_PUBLIC_WHATSAPP_BOT);
  if (!numero) return null;
  const base = `https://wa.me/${numero}`;
  return comando ? `${base}?text=${encodeURIComponent(comando)}` : base;
}

/** Só os dígitos do número do bot (`+55 82 ...` vira `5582...`); `''` quando não há nenhum. */
export function numeroDoBot(valor: string | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

/** Usuário do bot no Telegram, sem `@` nem espaços; `''` quando falta ou não é um usuário válido. */
export function usuarioDoBot(valor: string | undefined): string {
  const usuario = (valor ?? '').trim().replace(/^@/, '');
  return /^[A-Za-z0-9_]+$/.test(usuario) ? usuario : '';
}

/** O `start` do Telegram aceita só `A-Z a-z 0-9 _ -`, até 64 caracteres. */
const PAYLOAD_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Comando do bot como `start` do Telegram, que o backend decodifica: `apoiar <slug>` vira
 * `apoiar_<slug>`, `ajudar <slug>` vira `ajudar_<slug>` e `nova pauta` vira `nova`. Devolve `null`
 * quando o comando não cabe no `start` (outro comando, caractere fora do permitido ou mais de 64
 * caracteres): slugs gerados chegam a 69 caracteres, e `apoiar_` + slug passa do limite.
 */
export function payloadTelegram(comando: string): string | null {
  if (comando === COMANDO_NOVA_PAUTA) return 'nova';
  if (!/^(apoiar|ajudar) \S+$/.test(comando)) return null;
  const payload = comando.replace(' ', '_');
  return PAYLOAD_VALIDO.test(payload) ? payload : null;
}

/**
 * Link t.me do bot, com o comando no `start`. Devolve `null` sem usuário configurado. Comando que não
 * cabe no `start` abre o bot sem comando, em vez de um link que o Telegram rejeitaria.
 */
export function linkTelegram(comando?: string): string | null {
  const usuario = usuarioDoBot(process.env.NEXT_PUBLIC_TELEGRAM_BOT);
  if (!usuario) return null;
  const base = `https://t.me/${usuario}`;
  const payload = comando ? payloadTelegram(comando) : null;
  return payload ? `${base}?start=${payload}` : base;
}

/**
 * Exige o número do bot. O `next.config.ts` chama no build de produção: sem número, o build falha
 * com esta mensagem em vez de publicar o site sem os botões (SCRUM-43).
 */
export function exigirNumeroDoBot(valor: string | undefined): string {
  const numero = numeroDoBot(valor);
  if (!numero) {
    throw new Error(
      'NEXT_PUBLIC_WHATSAPP_BOT não configurada: o build do site precisa do número do bot no WhatsApp (só dígitos, com DDI). Veja o .env.example.',
    );
  }
  return numero;
}

/**
 * Exige o bot do canal ativo no build de produção: o número no WhatsApp ou o usuário no Telegram.
 * Canal desconhecido também falha, em vez de publicar o site sem os botões.
 */
export function exigirBotDoCanal(env: {
  canal: string | undefined;
  whatsapp: string | undefined;
  telegram: string | undefined;
}): CanalDoBot {
  const canal = canalDoBot(env.canal);
  if (canal === null) {
    throw new Error(
      `NEXT_PUBLIC_CANAL_BOT inválida ("${env.canal ?? ''}"): use whatsapp ou telegram. Veja o .env.example.`,
    );
  }
  if (canal === 'whatsapp') {
    exigirNumeroDoBot(env.whatsapp);
  } else if (!usuarioDoBot(env.telegram)) {
    throw new Error(
      'NEXT_PUBLIC_TELEGRAM_BOT não configurada: com NEXT_PUBLIC_CANAL_BOT=telegram, o build do site precisa do usuário do bot no Telegram (sem @). Veja o .env.example.',
    );
  }
  return canal;
}
