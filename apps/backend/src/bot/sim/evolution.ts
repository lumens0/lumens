// Construtores de payloads do webhook da Evolution API (v2.3.7), usados pelo simulador
// (`pnpm sim --canal evolution`), pelas fixtures e pelos testes (SCRUM-275).
//
// O formato segue o código da v2.3.7 (`sendDataWebhook` com o `messageRaw` do
// `whatsapp.baileys.service.ts`). Os campos que o bot não lê ficam de fora. Quando o spike com o
// chip rodar, confira com os payloads reais e ajuste aqui (e nas fixtures) o que divergir.
import { randomBytes } from 'node:crypto';
import { DEFAULT_FROM } from './payloads';

export const INSTANCIA_PADRAO = 'lumens';

export interface OpcoesEvolution {
  /** Número de quem escreve, só dígitos. Padrão: 5582999990000. */
  from?: string | undefined;
  /** Id da mensagem (fixe para testar o dedup). Padrão: aleatório. */
  id?: string | undefined;
  /** Segundos desde a época. Padrão: agora. */
  timestamp?: number | undefined;
  /**
   * Endereçamento por LID: `remoteJid` vira `<lid>@lid`. Com `from` o número vem em
   * `remoteJidAlt`; com `from: null`, não vem (o caso que o bot ignora).
   */
  lid?: string | undefined;
  instancia?: string | undefined;
}

/** Id no formato dos ids da Baileys (hex em maiúsculas). */
export function idAleatorio(): string {
  return '3EB0' + randomBytes(10).toString('hex').toUpperCase();
}

function chave(opts: OpcoesEvolution, numero: string | null = opts.from ?? DEFAULT_FROM) {
  const jidDoNumero = numero === null ? undefined : `${numero}@s.whatsapp.net`;
  if (opts.lid === undefined) {
    return { remoteJid: jidDoNumero ?? '', fromMe: false, id: opts.id ?? idAleatorio() };
  }
  // A Evolution troca o remoteJid pelo remoteJidAlt quando ele existe (v2.3.7).
  return {
    remoteJid: jidDoNumero ?? `${opts.lid}@lid`,
    remoteJidAlt: jidDoNumero,
    addressingMode: 'lid',
    fromMe: false,
    id: opts.id ?? idAleatorio(),
  };
}

/** Um webhook da Evolution: um evento, uma instância, o `data`. */
export interface PayloadEvolution {
  event: string;
  instance: string;
  data: unknown;
  destination: string;
  date_time: string;
  server_url: string;
}

/** Envelope do webhook: um evento, uma instância, o `data`. */
export function envelope(
  event: string,
  data: unknown,
  instancia = INSTANCIA_PADRAO,
): PayloadEvolution {
  return {
    event,
    instance: instancia,
    data,
    destination: 'http://backend:3000/webhook/evolution',
    date_time: '2026-01-01T00:00:00.000Z',
    server_url: 'http://localhost:8080',
  };
}

function upsert(opts: OpcoesEvolution, message: object, messageType: string, k = chave(opts)) {
  return envelope(
    'messages.upsert',
    {
      key: k,
      pushName: 'Pessoa Simulada',
      message,
      messageType,
      messageTimestamp: opts.timestamp ?? Math.floor(Date.now() / 1000),
      source: 'android',
    },
    opts.instancia,
  );
}

export function evolutionTexto(opts: OpcoesEvolution & { body: string }) {
  return upsert(opts, { conversation: opts.body }, 'conversation');
}

export function evolutionEncaminhada(opts: OpcoesEvolution & { body: string; vezes?: number }) {
  return upsert(
    opts,
    {
      extendedTextMessage: {
        text: opts.body,
        contextInfo: { isForwarded: true, forwardingScore: opts.vezes ?? 1 },
      },
    },
    'extendedTextMessage',
  );
}

export function evolutionImagem(opts: OpcoesEvolution & { caption?: string | undefined }) {
  return upsert(
    opts,
    {
      imageMessage: {
        url: 'https://mmg.whatsapp.net/v/t62.7118-24/simulada.enc',
        mimetype: 'image/jpeg',
        fileSha256: 'c2ltdWxhZGE=',
        fileLength: '24576',
        mediaKey: 'Y2hhdmUtc2ltdWxhZGE=',
        directPath: '/v/t62.7118-24/simulada.enc',
        ...(opts.caption === undefined ? {} : { caption: opts.caption }),
      },
    },
    'imageMessage',
  );
}

/** Mensagem num grupo: o bot ignora. */
export function evolutionGrupo(opts: OpcoesEvolution & { body: string }) {
  return upsert(opts, { conversation: opts.body }, 'conversation', {
    remoteJid: '120363000000000000@g.us',
    fromMe: false,
    id: opts.id ?? idAleatorio(),
  });
}

/** Mensagem que o próprio chip mandou: o bot ignora. */
export function evolutionPropria(opts: OpcoesEvolution & { body: string }) {
  return upsert(opts, { conversation: opts.body }, 'conversation', {
    ...chave(opts),
    fromMe: true,
  });
}

/** Conversa 1:1 que chega só com LID, sem número: o bot ignora e conta em `semNumero`. */
export function evolutionSoLid(opts: OpcoesEvolution & { body: string }) {
  return upsert(
    { ...opts, lid: opts.lid ?? '123456789012345' },
    { conversation: opts.body },
    'conversation',
    chave({ ...opts, lid: opts.lid ?? '123456789012345' }, null),
  );
}

/** Entrega de uma mensagem que o bot mandou (`messages.update`). */
export function evolutionStatus(opts: {
  id: string;
  status: 'DELIVERY_ACK' | 'READ' | 'ERROR';
  instancia?: string;
}) {
  return envelope(
    'messages.update',
    {
      keyId: opts.id,
      remoteJid: `${DEFAULT_FROM}@s.whatsapp.net`,
      fromMe: true,
      status: opts.status,
    },
    opts.instancia,
  );
}
