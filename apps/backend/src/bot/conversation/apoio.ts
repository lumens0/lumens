/**
 * História 2.7 · Apoiar e mandar foto (RF-B06, RF-B07).
 *
 *   2.5 "É essa" ──────┐
 *   2.4 'apoiar' ──────┴─▶ estudante verificado? ──não──▶ VERIFY_ASK_EMAIL, guardando o pedido
 *                                │ sim
 *                                ▼
 *                         registrarApoio ──▶ placar (apoios / meta) e, se bateu, o aviso (3.2)
 *                                │
 *                                ▼
 *   SUPPORT_ASK_REPORT ──(sim / relato escrito)──▶ SUPPORT_ASK_PHOTO ──▶ adicionarRelato (pendente)
 *        └──(não / pular)──▶ menu                     └──(foto ou 'pular')
 *
 * O apoio conta na hora (RN12); o relato e a foto ficam `pendente` até a moderação (5.3) e nunca
 * aparecem no site antes disso. Enquanto a conversa dura, o relato fica cifrado nos dados, como
 * na 2.5. Bater a meta grava `meta_batida` na linha do tempo (dentro de `registrarApoio`) e já
 * põe o aviso coletivo na fila, na mesma transação.
 */
import { ORIGEM_SITE_PRODUCAO } from '@lumens/contratos';
import { eq, pautas, type Db } from '@lumens/db';
import {
  RELATO_MAXIMO,
  adicionarRelato,
  enfileirarAvisoMetaBatida,
  registrarApoio,
  type ResultadoRelato,
} from '@lumens/dominio';
import { z } from 'zod';
import { conviteCoOwner } from './co-owner';
import { estudanteVerificado } from './estudante';
import type { DataPatch, Segredo, StepContext, StepHandler, StepResult } from './handlers';
import { photoRefusedText } from './nova-pauta';
import type { MensagemDeImagem, Resposta } from './resposta';
import { normalize } from './texto';

export const SUPPORT_VERIFY_FIRST_TEXT =
  'Para apoiar uma pauta, você precisa ser estudante verificado. Vamos verificar o seu e-mail institucional: qual é ele?';
export const SUPPORT_NOT_VERIFIED_TEXT =
  'Não consegui registrar o apoio: o seu cadastro de estudante não está verificado. Escolha 3 no menu para verificar o e-mail.';
export const SUPPORT_CLOSED_TEXT =
  'Essa pauta não está recebendo apoios agora. Escolha 1 no menu para relatar outro problema.';
export const SUPPORT_NOT_FOUND_TEXT =
  'Não encontrei essa pauta. Escolha 1 no menu para relatar o problema de novo.';
export const ASK_ATTACH_REPORT_TEXT =
  'Quer juntar o seu relato a esta pauta? Ele ajuda a curadoria e só aparece no site depois da moderação, sem o seu nome.\nResponda *sim* ou *não*.';
export const ASK_WRITE_REPORT_TEXT =
  "Quer contar o que você viu? Escreva um relato curto, ou responda 'pular'. Ele só aparece no site depois da moderação, sem o seu nome.";
export const SUPPORT_PHOTO_ASK_TEXT =
  "Quer mandar uma foto do problema? Envie a foto (JPEG ou PNG, até 5 MB), ou responda 'pular'.";
export const SUPPORT_DONE_TEXT = 'Tudo certo, o seu apoio já está contado.';
export const REPORT_SENT_TEXT =
  'Relato enviado para a moderação. Ele aparece no site depois de aprovado, sem o seu nome.';
export const REPORT_SENT_WITH_PHOTO_TEXT =
  'Relato e foto enviados para a moderação. Eles aparecem no site depois de aprovados, sem o seu nome.';
export const SUPPORT_DATA_LOST_TEXT =
  'Não consegui recuperar o seu relato. O seu apoio continua contado.';
export const REPORT_REFUSED_TEXT =
  'Não consegui guardar o relato, mas o seu apoio continua contado.';

export function reportTooLongText(tamanho: number): string {
  return `Seu relato tem ${String(tamanho)} caracteres e o limite é ${String(RELATO_MAXIMO)}. Escreva um relato mais curto, ou responda 'pular'.`;
}

/** Placar depois do apoio: "Agora são 12 de 30 apoios." */
export function placarText(total: number, meta: number): string {
  return `Agora são ${String(total)} de ${String(meta)} apoios.`;
}

export function supportedText(titulo: string, total: number, meta: number): string {
  return `Apoio registrado! ✅ Você apoia a pauta *${titulo}*. ${placarText(total, meta)}`;
}

export function alreadySupportsText(titulo: string, total: number, meta: number): string {
  return `Você já apoia esta pauta: *${titulo}*. ${placarText(total, meta)}`;
}

export function goalReachedText(meta: number): string {
  return `Com o seu apoio, a pauta chegou à meta de ${String(meta)} apoios! 🎉 Quem apoia vai receber o aviso.`;
}

/**
 * Card da pauta para compartilhar (2.9), gerado pelo site. O total na query string fura o cache de
 * 5 min do card, para a imagem sair com o número de agora.
 */
export function cardDaPauta(slug: string, totalApoios: number): MensagemDeImagem {
  const link = `${ORIGEM_SITE_PRODUCAO}/p/${slug}`;
  return {
    tipo: 'imagem',
    url: `${link}/card.png?apoios=${String(totalApoios)}`,
    legenda: `Compartilhe para juntar mais apoios: ${link}`,
  };
}

const YES = new Set(['sim', 's', 'quero', 'pode']);
const NO = new Set(['nao', 'n', 'nao quero']);
const SKIP = new Set(['pular', 'nao', 'n', 'sem foto', 'sem relato']);

/** O que os passos do apoio guardam na conversa. Validado: o dado pode ser de outra versão. */
const dadosSchema = z.object({
  apoioPautaId: z.string().optional(),
  relatoCifrado: z.string().optional(),
});

function dadosDoApoio(data: unknown): z.infer<typeof dadosSchema> {
  const lidos = dadosSchema.safeParse(data);
  return lidos.success ? lidos.data : {};
}

/** Tira da conversa o apoio e o relato (da 2.5 ou escrito aqui). */
const LIMPAR: DataPatch = {
  apoioPautaId: undefined,
  relatoCifrado: undefined,
  blocoId: undefined,
  parecidas: undefined,
  pendingCommand: undefined,
};

const tamanho = (texto: string) => Array.from(texto).length;

function decifrado(segredo: Segredo, cifrado: string | undefined): string | undefined {
  if (cifrado === undefined) return undefined;
  try {
    return segredo.decifrar(cifrado);
  } catch {
    return undefined;
  }
}

const fim = (replies: Resposta[]): StepResult => ({ next: 'MENU', data: LIMPAR, replies });

/** Fim com o apoio contado: convida para cuidar da pauta quando há vaga (2.8). */
async function fimDoApoio(
  { db, phoneHmac }: Pick<StepContext, 'db' | 'phoneHmac'>,
  pautaId: string,
  replies: Resposta[],
): Promise<StepResult> {
  const estudanteId = await estudanteVerificado(db, phoneHmac);
  const convite =
    estudanteId === undefined ? undefined : await conviteCoOwner(db, { pautaId, estudanteId });
  return fim(convite === undefined ? replies : [...replies, convite]);
}

async function pautaDoPlacar(db: Db, pautaId: string) {
  const [pauta] = await db
    .select({ titulo: pautas.titulo, slug: pautas.slug, meta: pautas.meta })
    .from(pautas)
    .where(eq(pautas.id, pautaId));
  return pauta;
}

/**
 * Porta de entrada do apoio, pela lista de parecidas (2.5) ou pelo pedido guardado na
 * verificação. Quem não é verificado vai para a verificação com o pedido em `pendingCommand`, e o
 * relato da 2.5, se houver, continua na conversa para ser oferecido depois.
 */
export async function entrarNoApoio(
  { db, phoneHmac, state }: Pick<StepContext, 'db' | 'phoneHmac' | 'state'>,
  pautaId: string,
  antes: Resposta[] = [],
): Promise<StepResult> {
  const estudanteId = await estudanteVerificado(db, phoneHmac);
  if (estudanteId === undefined) {
    return {
      next: 'VERIFY_ASK_EMAIL',
      data: { pendingCommand: { kind: 'apoiar', id: pautaId }, parecidas: undefined },
      replies: [...antes, SUPPORT_VERIFY_FIRST_TEXT],
    };
  }

  // Transação aninhada (savepoint): apoio, evento de meta e aviso confirmam juntos.
  const resultado = await db.transaction(async (tx) => {
    const r = await registrarApoio(tx, { pautaId, estudanteId, origem: 'bot' });
    if (r.registrado && r.metaBatidaAgora) await enfileirarAvisoMetaBatida(tx, { pautaId });
    return r;
  });

  if (!resultado.registrado && resultado.motivo !== 'ja_apoiou') {
    if (resultado.motivo === 'estudante_nao_verificado') {
      return fim([...antes, SUPPORT_NOT_VERIFIED_TEXT]);
    }
    if (resultado.motivo === 'pauta_inexistente') return fim([...antes, SUPPORT_NOT_FOUND_TEXT]);
    return fim([...antes, SUPPORT_CLOSED_TEXT]);
  }

  const pauta = await pautaDoPlacar(db, pautaId);
  if (pauta === undefined) return fim([...antes, SUPPORT_NOT_FOUND_TEXT]);

  const replies: Resposta[] = [...antes];
  if (resultado.registrado) {
    replies.push(supportedText(pauta.titulo, resultado.totalApoios, pauta.meta));
    if (resultado.metaBatidaAgora) replies.push(goalReachedText(pauta.meta));
  } else {
    replies.push(alreadySupportsText(pauta.titulo, resultado.totalApoios, pauta.meta));
  }
  replies.push(cardDaPauta(pauta.slug, resultado.totalApoios));

  const temRelato = dadosDoApoio(state.data).relatoCifrado !== undefined;
  replies.push(temRelato ? ASK_ATTACH_REPORT_TEXT : ASK_WRITE_REPORT_TEXT);
  return {
    next: 'SUPPORT_ASK_REPORT',
    data: {
      apoioPautaId: pautaId,
      blocoId: undefined,
      parecidas: undefined,
      pendingCommand: undefined,
    },
    replies,
  };
}

/**
 * Relato opcional. Vindo da 2.5, a pessoa já escreveu: só confirma se quer juntá-lo à pauta.
 * Vindo do pedido guardado, pode escrever agora ou pular.
 */
export const supportAskReport: StepHandler = async (ctx) => {
  const { state, input, segredo } = ctx;
  const { apoioPautaId, relatoCifrado } = dadosDoApoio(state.data);
  if (apoioPautaId === undefined) return fim([SUPPORT_DATA_LOST_TEXT]);
  const texto = normalize(input.text);

  if (relatoCifrado !== undefined) {
    if (NO.has(texto)) return fimDoApoio(ctx, apoioPautaId, [SUPPORT_DONE_TEXT]);
    if (!YES.has(texto)) return { next: 'SUPPORT_ASK_REPORT', replies: [ASK_ATTACH_REPORT_TEXT] };
    const relato = decifrado(segredo, relatoCifrado);
    if (relato === undefined) {
      return {
        next: 'SUPPORT_ASK_REPORT',
        data: { relatoCifrado: undefined },
        replies: [SUPPORT_DATA_LOST_TEXT, ASK_WRITE_REPORT_TEXT],
      };
    }
    // O relato da 2.5 não tem limite; o da pauta tem. Grande demais, a pessoa escreve outro.
    if (tamanho(relato.trim()) > RELATO_MAXIMO) {
      return {
        next: 'SUPPORT_ASK_REPORT',
        data: { relatoCifrado: undefined },
        replies: [reportTooLongText(tamanho(relato.trim()))],
      };
    }
    return { next: 'SUPPORT_ASK_PHOTO', replies: [SUPPORT_PHOTO_ASK_TEXT] };
  }

  if (SKIP.has(texto)) return fimDoApoio(ctx, apoioPautaId, [SUPPORT_DONE_TEXT]);
  const relato = input.text.trim();
  if (relato === '') return { next: 'SUPPORT_ASK_REPORT', replies: [ASK_WRITE_REPORT_TEXT] };
  if (tamanho(relato) > RELATO_MAXIMO) {
    return { next: 'SUPPORT_ASK_REPORT', replies: [reportTooLongText(tamanho(relato))] };
  }
  return {
    next: 'SUPPORT_ASK_PHOTO',
    data: { relatoCifrado: segredo.cifrar(relato) },
    replies: [SUPPORT_PHOTO_ASK_TEXT],
  };
};

/** Foto opcional do relato, pelo mesmo serviço da pauta nova (2.6). */
export const supportAskPhoto: StepHandler = async (ctx) => {
  const { image } = ctx.input;
  if (image) {
    const foto = ctx.fotos
      ? await ctx.fotos.guardarFoto(image)
      : ({ ok: false, motivo: 'indisponivel' } as const);
    if (!foto.ok) return { next: 'SUPPORT_ASK_PHOTO', replies: [photoRefusedText(foto.motivo)] };
    return salvarRelato(ctx, foto.chave);
  }
  if (SKIP.has(normalize(ctx.input.text))) return salvarRelato(ctx, null);
  return { next: 'SUPPORT_ASK_PHOTO', replies: [SUPPORT_PHOTO_ASK_TEXT] };
};

async function salvarRelato(ctx: StepContext, fotoChave: string | null): Promise<StepResult> {
  const { state, db, segredo, phoneHmac } = ctx;
  const { apoioPautaId, relatoCifrado } = dadosDoApoio(state.data);
  const texto = decifrado(segredo, relatoCifrado);
  if (apoioPautaId === undefined || texto === undefined) return fim([SUPPORT_DATA_LOST_TEXT]);

  // Confere de novo: a pessoa pode ter saído no meio da conversa.
  const estudanteId = await estudanteVerificado(db, phoneHmac);
  if (estudanteId === undefined) return fim([SUPPORT_NOT_VERIFIED_TEXT]);

  const resultado: ResultadoRelato = await db.transaction((tx) =>
    adicionarRelato(tx, { pautaId: apoioPautaId, estudanteId, texto, fotoChave }),
  );
  if (!resultado.registrado) return fimDoApoio(ctx, apoioPautaId, [REPORT_REFUSED_TEXT]);
  return fimDoApoio(ctx, apoioPautaId, [
    fotoChave === null ? REPORT_SENT_TEXT : REPORT_SENT_WITH_PHOTO_TEXT,
  ]);
}
