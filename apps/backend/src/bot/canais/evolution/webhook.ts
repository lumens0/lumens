/**
 * Webhook da Evolution API (SCRUM-275): converte `messages.upsert` na mesma mensagem que a Meta
 * mandaria e enfileira pelo mesmo caminho (`enfileirar`), com o mesmo dedup, a mesma cifra e a
 * mesma ordem por conversa. `messages.update` das mensagens do bot vira status de entrega.
 *
 * Formato conferido no código da v2.3.7 (`whatsapp.baileys.service.ts`): quando a mensagem chega
 * endereçada por LID (`...@lid`) e a Baileys sabe o número, a Evolution troca o `remoteJid` pelo
 * `remoteJidAlt` antes de mandar o webhook. Mensagem sem número nenhum é ignorada e contada em
 * `semNumero`: sem telefone, o bot não acha o estudante (`telefone_hmac`).
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { hmacHex } from '../../../cripto/cifra';
import { resumoDoErro } from '../../../infra/logger';
import type { StatusDeEnvioJob } from '../../envio/worker';
import { enfileirar, enfileirarStatus, mensagemSchema } from '../../webhook/process';
import type { ProcessDeps as DepsDoWebhook } from '../../webhook/process';

export const ROTA_DO_WEBHOOK = '/webhook/evolution';

export interface ResultadoDoWebhook {
  enfileiradas: number;
  duplicadas: number;
  /** De grupo, status, canal, do próprio bot, reação ou aviso do sistema. */
  ignoradas: number;
  /** Conversa 1:1 que chegou só com LID, sem o número: não dá para achar o estudante. */
  semNumero: number;
  statusEnfileirados: number;
  /** Partes fora do formato esperado. */
  invalidas: number;
}

const PESSOA = '@s.whatsapp.net';
const LID = '@lid';

const envelopeSchema = z.object({
  event: z.string(),
  instance: z.string().min(1),
  data: z.unknown(),
});

const chaveSchema = z.object({
  id: z.string().min(1),
  remoteJid: z.string().min(1),
  fromMe: z.boolean().optional(),
  remoteJidAlt: z.string().nullish(),
  senderPn: z.string().nullish(),
});

const upsertSchema = z.object({
  key: chaveSchema,
  message: z.record(z.string(), z.unknown()).nullish(),
  messageTimestamp: z.union([z.number(), z.string()]).nullish(),
});

const atualizacaoSchema = z.object({
  keyId: z.string().min(1).optional(),
  key: z.object({ id: z.string().min(1) }).optional(),
  fromMe: z.boolean().optional(),
  status: z.string(),
});

/** Status da Baileys que mudam o registro de entrega dos avisos. */
const STATUS_DE_ENTREGA: Record<string, StatusDeEnvioJob['status']> = {
  DELIVERY_ACK: 'delivered',
  READ: 'read',
  PLAYED: 'read',
  ERROR: 'failed',
};

/** Tipos da Baileys sem resposta, como `reaction` e `system` no webhook da Meta. */
const SEM_RESPOSTA: Record<string, string> = {
  reactionMessage: 'reaction',
  protocolMessage: 'system',
  senderKeyDistributionMessage: 'system',
  messageContextInfo: 'system',
  pollUpdateMessage: 'system',
};

/** O que a Meta chama de `type` para os formatos que o bot ainda não entende. */
const OUTROS_TIPOS: Record<string, string> = {
  audioMessage: 'audio',
  videoMessage: 'video',
  ptvMessage: 'video',
  stickerMessage: 'sticker',
  locationMessage: 'location',
  liveLocationMessage: 'location',
  contactMessage: 'contacts',
  contactsArrayMessage: 'contacts',
};

/**
 * O número de quem escreveu, só com dígitos (como o `from` da Meta), ou `null` quando a
 * mensagem só traz LID.
 */
export function numeroDoRemetente(chave: z.infer<typeof chaveSchema>): string | null {
  for (const jid of [chave.remoteJid, chave.remoteJidAlt, chave.senderPn]) {
    if (typeof jid !== 'string' || !jid.endsWith(PESSOA)) continue;
    // "5582...:12@s.whatsapp.net" traz o aparelho depois dos dois-pontos.
    const usuario = jid.slice(0, -PESSOA.length).split(':')[0] ?? '';
    if (/^\d{8,15}$/.test(usuario)) return usuario;
  }
  return null;
}

type Objeto = Record<string, unknown>;
const objeto = (valor: unknown): Objeto | undefined =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Objeto)
    : undefined;
const texto = (valor: unknown): string | undefined =>
  typeof valor === 'string' ? valor : undefined;

/** `context` no formato da Meta. `frequently_forwarded` segue a regra do app (mais de 4). */
function contexto(info: Objeto | undefined) {
  if (info?.isForwarded !== true) return {};
  const vezes = typeof info.forwardingScore === 'number' ? info.forwardingScore : 0;
  return { context: { forwarded: true, frequently_forwarded: vezes > 4 } };
}

/**
 * Referência opaca da mídia, guardada no `image.id`/`document.id` do job (que vai cifrado). A
 * Evolution baixa pela mensagem inteira (`getBase64FromMediaMessage`), sem precisar tê-la
 * gravado no banco dela — e ela não grava (DATABASE_SAVE_DATA_NEW_MESSAGE=false).
 */
function referencia(chave: z.infer<typeof chaveSchema>, tipo: string, midia: Objeto): string {
  return JSON.stringify({
    key: { id: chave.id, remoteJid: chave.remoteJid, fromMe: chave.fromMe ?? false },
    message: { [tipo]: midia },
  });
}

/** O conteúdo no formato da Meta (`type` e o campo do tipo), ou o tipo a ignorar. */
function converter(
  chave: z.infer<typeof chaveSchema>,
  mensagem: Objeto,
): { type: string; [campo: string]: unknown } {
  const conversa = texto(mensagem.conversation);
  if (conversa !== undefined) return { type: 'text', text: { body: conversa } };

  const estendido = objeto(mensagem.extendedTextMessage);
  const corpo = texto(estendido?.text);
  if (corpo !== undefined) {
    return { type: 'text', text: { body: corpo }, ...contexto(objeto(estendido?.contextInfo)) };
  }

  const imagem = objeto(mensagem.imageMessage);
  if (imagem) {
    const legenda = texto(imagem.caption);
    return {
      type: 'image',
      image: {
        id: referencia(chave, 'imageMessage', imagem),
        mime_type: texto(imagem.mimetype) ?? 'image/jpeg',
        sha256: texto(imagem.fileSha256) ?? '',
        ...(legenda === undefined ? {} : { caption: legenda }),
      },
      ...contexto(objeto(imagem.contextInfo)),
    };
  }

  const documento =
    objeto(mensagem.documentMessage) ??
    objeto(objeto(objeto(mensagem.documentWithCaptionMessage)?.message)?.documentMessage);
  if (documento) {
    return {
      type: 'document',
      document: {
        id: referencia(chave, 'documentMessage', documento),
        mime_type: texto(documento.mimetype) ?? 'application/octet-stream',
        ...(texto(documento.fileSha256) === undefined ? {} : { sha256: documento.fileSha256 }),
      },
    };
  }

  const tipos = Object.keys(mensagem);
  for (const tipo of tipos) {
    const meta = OUTROS_TIPOS[tipo];
    if (meta !== undefined) return { type: meta };
  }
  for (const tipo of tipos) {
    const meta = SEM_RESPOSTA[tipo];
    if (meta !== undefined) return { type: meta };
  }
  return { type: 'unsupported' };
}

/**
 * Embrulhos que a Baileys põe em volta da mensagem: conversa com mensagens temporárias e
 * visualização única. A Evolution v2.3.7 manda o embrulho como veio (`prepareMessage` copia a
 * `message` inteira), então o texto de `{ ephemeralMessage: { message: { conversation } } }`
 * estaria um nível abaixo do que o `converter` procura.
 */
const EMBRULHOS = [
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
] as const;

/** A mensagem de dentro dos embrulhos (até três níveis), ou a própria mensagem. */
function desembrulhar(mensagem: Objeto): Objeto {
  let atual = mensagem;
  for (let nivel = 0; nivel < 3; nivel++) {
    const interna = EMBRULHOS.map((embrulho) => objeto(objeto(atual[embrulho])?.message)).find(
      (m) => m !== undefined,
    );
    if (interna === undefined) return atual;
    atual = interna;
  }
  return atual;
}

/** Lista de itens, venha o `data` como objeto ou como lista. */
const itens = (data: unknown): unknown[] => (Array.isArray(data) ? data : [data]);

export async function processarWebhookDaEvolution(
  payload: unknown,
  deps: DepsDoWebhook,
): Promise<ResultadoDoWebhook> {
  const resultado: ResultadoDoWebhook = {
    enfileiradas: 0,
    duplicadas: 0,
    ignoradas: 0,
    semNumero: 0,
    statusEnfileirados: 0,
    invalidas: 0,
  };
  const invalida = (parte: string, erro: z.ZodError) => {
    // Só o caminho dos campos, nunca os valores: o payload tem telefone e texto da pessoa.
    const campos = erro.issues.map((problema) => problema.path.join('.'));
    deps.logger.warn({ parte, campos }, 'parte do webhook da Evolution fora do formato, ignorada');
    resultado.invalidas++;
  };

  const envelope = envelopeSchema.safeParse(payload);
  if (!envelope.success) {
    invalida('envelope', envelope.error);
    return resultado;
  }
  const { event, instance, data } = envelope.data;

  if (event === 'messages.update') {
    for (const bruto of itens(data)) {
      const atualizacao = atualizacaoSchema.safeParse(bruto);
      if (!atualizacao.success) {
        invalida('messages.update', atualizacao.error);
        continue;
      }
      const id = atualizacao.data.keyId ?? atualizacao.data.key?.id;
      const status = STATUS_DE_ENTREGA[atualizacao.data.status];
      // Só interessa a entrega do que o bot mandou (os avisos).
      if (id === undefined || status === undefined || atualizacao.data.fromMe !== true) continue;
      await enfileirarStatus(
        { id, status, timestamp: String(Math.floor(Date.now() / 1000)) },
        deps,
      );
      resultado.statusEnfileirados++;
    }
    return resultado;
  }

  if (event !== 'messages.upsert') return resultado;

  for (const bruto of itens(data)) {
    const upsert = upsertSchema.safeParse(bruto);
    if (!upsert.success) {
      invalida('messages.upsert', upsert.error);
      continue;
    }
    const { key, message, messageTimestamp } = upsert.data;
    const conversaUmAUm = key.remoteJid.endsWith(PESSOA) || key.remoteJid.endsWith(LID);
    if (key.fromMe === true || !conversaUmAUm || !message) {
      resultado.ignoradas++;
      continue;
    }
    const numero = numeroDoRemetente(key);
    if (numero === null) {
      // Prefixo do HMAC do id: dá para achar o caso no log sem expor nada.
      deps.logger
        .child({ mensagem: hmacHex(key.id, deps.chaves.hmac).slice(0, 12) })
        .warn('mensagem 1:1 sem número (só LID), ignorada');
      resultado.semNumero++;
      continue;
    }

    const conteudo = converter(key, desembrulhar(message));
    if (conteudo.type === 'reaction' || conteudo.type === 'system') {
      deps.logger.info({ type: conteudo.type }, 'mensagem sem resposta (ignorada)');
      resultado.ignoradas++;
      continue;
    }
    const mensagem = mensagemSchema.safeParse({
      ...conteudo,
      id: key.id,
      from: numero,
      timestamp: String(messageTimestamp ?? Math.floor(Date.now() / 1000)),
    });
    if (!mensagem.success) {
      invalida('message', mensagem.error);
      continue;
    }
    if (await enfileirar(mensagem.data, instance, deps)) resultado.enfileiradas++;
    else resultado.duplicadas++;
  }
  return resultado;
}

/** Compara em tempo constante, inclusive no tamanho (os dois lados viram SHA-256). */
function autorizado(cabecalho: string | undefined, segredo: string): boolean {
  if (cabecalho === undefined) return false;
  const esperado = createHash('sha256').update(`Bearer ${segredo}`).digest();
  const recebido = createHash('sha256').update(cabecalho).digest();
  return timingSafeEqual(esperado, recebido);
}

/**
 * A rota. A Evolution manda o segredo no header `Authorization` (configurado no webhook da
 * instância). Ela repete o envio quando recebe 5xx, mas não 401: segredo errado não insiste.
 *
 * Como na Meta, dedup e enqueue vêm ANTES do 200, na mesma transação: falhou, responde 500 e a
 * Evolution reenvia.
 */
export function webhookDaEvolution(segredo: string): FastifyPluginCallback<DepsDoWebhook> {
  return (app, deps, done) => {
    app.post(
      ROTA_DO_WEBHOOK,
      {
        // Antes de ler o corpo: quem não tem o segredo não chega nem ao parser.
        onRequest: (req, reply, next) => {
          const cabecalho = req.headers.authorization;
          if (autorizado(typeof cabecalho === 'string' ? cabecalho : undefined, segredo)) {
            next();
            return;
          }
          deps.logger.warn(
            { temCabecalho: Boolean(cabecalho) },
            'webhook da Evolution sem segredo válido',
          );
          void reply.code(401).send();
        },
      },
      async (req, reply) => {
        let resultado: ResultadoDoWebhook;
        try {
          resultado = await processarWebhookDaEvolution(req.body, deps);
        } catch (erro) {
          // Nunca `{ err }`: o erro de query traz o job (com o texto da pessoa) nos parâmetros.
          deps.logger.error(
            { erro: resumoDoErro(erro) },
            'falha ao processar webhook da Evolution',
          );
          return reply.code(500).send();
        }
        deps.logger.debug(resultado, 'webhook da Evolution processado');
        return reply.code(200).send();
      },
    );
    done();
  };
}
