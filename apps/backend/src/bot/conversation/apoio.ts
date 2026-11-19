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
 *   SUPPORT_ASK_REPORT ──(sim / relato escrito)──▶ adicionarRelato (pendente) ──▶ SUPPORT_ASK_PHOTO
 *        └──(não / pular)──▶ menu                                    foto ──▶ anexarFotoAoRelato
 *                                                                    'pular' ──▶ fica sem foto
 *
 * O apoio conta na hora (RN12); o relato e a foto ficam `pendente` até a moderação (5.3) e nunca
 * aparecem no site antes disso. Até a pessoa confirmar, o relato fica cifrado nos dados, como na
 * 2.5. Bater a meta grava `meta_batida` na linha do tempo (dentro de `registrarApoio`) e já põe o
 * aviso coletivo na fila, na mesma transação.
 *
 * SCRUM-301: o relato é gravado assim que a pessoa o confirma (ou escreve), antes da foto. Antes
 * ele só era gravado no fim do passo da foto, e se perdia quando a pessoa mandava outro comando,
 * "cancelar" ou parava de responder. A foto, se vier, é juntada ao mesmo relato.
 */
import { ORIGEM_SITE_PRODUCAO } from '@lumens/contratos';
import { eq, pautas, type Db } from '@lumens/db';
import {
  RELATO_MAXIMO,
  adicionarRelato,
  FOTOS_POR_RELATO_MAXIMO,
  anexarFotoAoRelato,
  enfileirarAvisoMetaBatida,
  registrarApoio,
} from '@lumens/dominio';
import { z } from 'zod';
import { conviteCoOwner } from './co-owner';
import { estudanteVerificado } from './estudante';
import type { DataPatch, Segredo, StepContext, StepHandler, StepResult } from './handlers';
import { SKIP_WORDS as FIM_DAS_FOTOS, photoMoreText, photoRefusedText } from './nova-pauta';
import type { MensagemDeImagem, Resposta } from './resposta';
import { normalize } from './texto';

export const SUPPORT_VERIFY_FIRST_TEXT =
  'Para apoiar uma pauta, você precisa verificar o seu e-mail institucional. Qual é ele?';
export const SUPPORT_NOT_VERIFIED_TEXT =
  'Não consegui registrar o apoio: falta verificar o seu e-mail institucional. Mande *menu* e escolha *Verificar e-mail* para verificar.';
export const SUPPORT_CLOSED_TEXT =
  'Essa pauta não está recebendo apoios agora. Mande *menu* e escolha *Relatar problema* para relatar outro problema.';
export const SUPPORT_NOT_FOUND_TEXT =
  'Não encontrei essa pauta. Mande *menu* e escolha *Relatar problema* para relatar o problema de novo.';
export const ASK_ATTACH_REPORT_TEXT =
  'Quer juntar o seu relato a esta pauta? Ele ajuda a curadoria e só aparece no site depois da moderação, sem o seu nome.\nResponda *sim* ou *não*.';
export const ASK_WRITE_REPORT_TEXT =
  'Quer contar o que você viu? Escreva numa mensagem o que aconteceu e onde, ou responda *pular*. O relato só aparece no site depois da moderação, sem o seu nome.';
export const SUPPORT_PHOTO_ASK_TEXT =
  `Quer mandar uma foto do problema? Envie a foto (JPEG ou PNG, até 5 MB), ou responda *pular*. Dá para mandar até ${String(FOTOS_POR_RELATO_MAXIMO)} fotos, uma por mensagem.` +
  ' As fotos aparecem no site, sem o seu nome, depois de aprovadas pela curadoria, que pode recusar cada uma. Não mostre rosto, placa nem documento. Ao enviar, você concorda com essa publicação (LGPD, art. 7º, I).';
export const PHOTO_NOT_ATTACHED_TEXT =
  'Não consegui juntar a foto: a curadoria já analisou o seu relato. O relato continua enviado.';
export const PHOTO_LIMIT_TEXT = `Esse relato já tem ${String(FOTOS_POR_RELATO_MAXIMO)} fotos, que é o limite. As fotos enviadas seguem para a moderação.`;
export const SUPPORT_DONE_TEXT = 'Tudo certo, o seu apoio já está contado ✅';
export const REPORT_SENT_TEXT =
  'Relato enviado para a moderação ✅ Ele aparece no site depois de aprovado, sem o seu nome.';
export const REPORT_SENT_WITH_PHOTO_TEXT =
  'Relato e foto enviados para a moderação ✅ Eles aparecem no site depois de aprovados, sem o seu nome.';
export const SUPPORT_DATA_LOST_TEXT =
  'Não consegui recuperar o seu relato. O seu apoio continua contado.';
export const REPORT_REFUSED_TEXT =
  'Não consegui guardar o relato, mas o seu apoio continua contado.';

/** SCRUM-343: resposta ao "sim" da pergunta do relato, que não é o relato. */
export const WRITE_REPORT_TEXT =
  'Pode escrever: conte numa mensagem o que você viu e onde. Se mudar de ideia, responda *pular*.';
/** SCRUM-343: o relato vai para a curadoria; uma ou duas palavras não dizem o que houve. */
export const SUPPORT_REPORT_TOO_SHORT_TEXT =
  'Conte um pouco mais: o que aconteceu e onde? Ex.: "o bebedouro do bloco 18 está quebrado". Ou responda *pular*.';

export function reportTooLongText(tamanho: number): string {
  return `Seu relato tem ${String(tamanho)} caracteres e o limite é ${String(RELATO_MAXIMO)}. Escreva um relato mais curto, ou responda *pular*.`;
}

/** Placar depois do apoio: "Agora temos 12 de 30 apoios." */
export function placarText(total: number, meta: number): string {
  // "Temos" evita a concordância errada no singular ("Agora são 1 de 120").
  return `Agora temos ${String(total)} de ${String(meta)} apoios.`;
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
/** SCRUM-343: "sim" à pergunta "Quer contar o que você viu?" quer dizer "vou escrever". */
const QUER_ESCREVER = new Set([...YES, 'sim quero', 'quero contar', 'quero escrever', 'claro']);
/** Menos que isso não diz o que aconteceu nem onde ("sim", "quebrado", "ar quebrado"). */
const PALAVRAS_DO_RELATO = 3;
const palavras = (texto: string) => (texto.match(/[\p{L}\p{N}]+/gu) ?? []).length;

/** O que os passos do apoio guardam na conversa. Validado: o dado pode ser de outra versão. */
const dadosSchema = z.object({
  apoioPautaId: z.string().optional(),
  relatoCifrado: z.string().optional(),
  /** SCRUM-301: o relato já gravado, à espera da foto. */
  relatoId: z.string().optional(),
  /** Quantas fotos já foram juntadas ao relato neste passo. */
  fotosJuntadas: z.number().int().min(0).max(FOTOS_POR_RELATO_MAXIMO).optional(),
});

function dadosDoApoio(data: unknown): z.infer<typeof dadosSchema> {
  const lidos = dadosSchema.safeParse(data);
  return lidos.success ? lidos.data : {};
}

/** Tira da conversa o apoio e o relato (da 2.5 ou escrito aqui). */
const LIMPAR: DataPatch = {
  apoioPautaId: undefined,
  relatoCifrado: undefined,
  relatoId: undefined,
  fotosJuntadas: undefined,
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
    return gravarRelato(ctx, apoioPautaId, relato);
  }

  if (SKIP.has(texto)) return fimDoApoio(ctx, apoioPautaId, [SUPPORT_DONE_TEXT]);
  // SCRUM-343: antes, o "sim" virava o próprio relato, e o texto de verdade caía no passo da foto.
  if (QUER_ESCREVER.has(texto)) return { next: 'SUPPORT_ASK_REPORT', replies: [WRITE_REPORT_TEXT] };
  const relato = input.text.trim();
  if (relato === '') return { next: 'SUPPORT_ASK_REPORT', replies: [ASK_WRITE_REPORT_TEXT] };
  // O longo demais tem resposta própria, logo abaixo, mesmo sem espaços.
  if (palavras(relato) < PALAVRAS_DO_RELATO && tamanho(relato) <= RELATO_MAXIMO) {
    return { next: 'SUPPORT_ASK_REPORT', replies: [SUPPORT_REPORT_TOO_SHORT_TEXT] };
  }
  if (tamanho(relato) > RELATO_MAXIMO) {
    return { next: 'SUPPORT_ASK_REPORT', replies: [reportTooLongText(tamanho(relato))] };
  }
  return gravarRelato(ctx, apoioPautaId, relato);
};

/**
 * Grava o relato (pendente, sem foto) e pede a foto (SCRUM-301). O texto sai da conversa: daqui
 * em diante ela só guarda o id do relato.
 */
async function gravarRelato(ctx: StepContext, pautaId: string, texto: string): Promise<StepResult> {
  const { db, phoneHmac } = ctx;
  // Confere de novo: a pessoa pode ter saído no meio da conversa.
  const estudanteId = await estudanteVerificado(db, phoneHmac);
  if (estudanteId === undefined) return fim([SUPPORT_NOT_VERIFIED_TEXT]);

  const resultado = await db.transaction((tx) =>
    adicionarRelato(tx, { pautaId, estudanteId, texto }),
  );
  if (!resultado.registrado) return fimDoApoio(ctx, pautaId, [REPORT_REFUSED_TEXT]);
  return {
    next: 'SUPPORT_ASK_PHOTO',
    data: { relatoId: resultado.relatoId, relatoCifrado: undefined },
    // A pessoa fica sabendo que o relato já foi: sair agora não o perde.
    replies: [REPORT_SENT_TEXT, SUPPORT_PHOTO_ASK_TEXT],
  };
}

/**
 * Foto opcional do relato já gravado, pelo mesmo serviço da pauta nova (2.6). Sair deste passo
 * de qualquer jeito (pular, outro comando, cancelar, conversa expirada) deixa o relato sem foto.
 */
export const supportAskPhoto: StepHandler = async (ctx) => {
  const { image } = ctx.input;
  const { fotosJuntadas = 0 } = dadosDoApoio(ctx.state.data);
  if (image) {
    const foto = ctx.fotos
      ? await ctx.fotos.guardarFoto(image)
      : ({ ok: false, motivo: 'indisponivel' } as const);
    if (!foto.ok) {
      return {
        next: 'SUPPORT_ASK_PHOTO',
        replies: [photoRefusedText(foto.motivo, fotosJuntadas)],
      };
    }
    return juntarFoto(ctx, foto.chave);
  }
  if (FIM_DAS_FOTOS.has(normalize(ctx.input.text))) return juntarFoto(ctx, null);
  return {
    next: 'SUPPORT_ASK_PHOTO',
    replies: [fotosJuntadas > 0 ? photoMoreText(fotosJuntadas) : SUPPORT_PHOTO_ASK_TEXT],
  };
};

/**
 * `fotoChave` é a foto que acabou de chegar (juntada ao relato na hora, uma por vez); `null` é o
 * fim do passo (*pronto* ou *pular*). Fecha sozinho ao chegar no limite.
 */
async function juntarFoto(ctx: StepContext, fotoChave: string | null): Promise<StepResult> {
  const { state, db, segredo, phoneHmac } = ctx;
  const { apoioPautaId, relatoCifrado, relatoId, fotosJuntadas = 0 } = dadosDoApoio(state.data);
  if (apoioPautaId === undefined) return fim([SUPPORT_DATA_LOST_TEXT]);

  if (relatoId === undefined) {
    // Conversa de antes da SCRUM-301, com o relato ainda nos dados: grava agora, com a foto.
    const texto = decifrado(segredo, relatoCifrado);
    if (texto === undefined) return fim([SUPPORT_DATA_LOST_TEXT]);
    const estudanteId = await estudanteVerificado(db, phoneHmac);
    if (estudanteId === undefined) return fim([SUPPORT_NOT_VERIFIED_TEXT]);
    const r = await db.transaction((tx) =>
      adicionarRelato(tx, {
        pautaId: apoioPautaId,
        estudanteId,
        texto,
        fotoChaves: fotoChave === null ? [] : [fotoChave],
      }),
    );
    if (!r.registrado) return fimDoApoio(ctx, apoioPautaId, [REPORT_REFUSED_TEXT]);
    return fimDoApoio(ctx, apoioPautaId, [
      fotoChave === null ? REPORT_SENT_TEXT : REPORT_SENT_WITH_PHOTO_TEXT,
    ]);
  }

  // Fim do passo: o relato já está gravado, com as fotos que chegaram até aqui.
  if (fotoChave === null) {
    return fimDoApoio(ctx, apoioPautaId, [
      fotosJuntadas > 0 ? REPORT_SENT_WITH_PHOTO_TEXT : SUPPORT_DONE_TEXT,
    ]);
  }

  const estudanteId = await estudanteVerificado(db, phoneHmac);
  if (estudanteId === undefined) return fim([SUPPORT_NOT_VERIFIED_TEXT]);
  const r = await db.transaction((tx) =>
    anexarFotoAoRelato(tx, { relatoId, estudanteId, fotoChave }),
  );
  if (!r.anexada) {
    // O que já foi enviado continua valendo; o texto diz por que esta foto ficou de fora.
    return fimDoApoio(ctx, apoioPautaId, [
      r.motivo === 'limite_de_fotos' ? PHOTO_LIMIT_TEXT : PHOTO_NOT_ATTACHED_TEXT,
    ]);
  }
  if (r.total >= FOTOS_POR_RELATO_MAXIMO) {
    return fimDoApoio(ctx, apoioPautaId, [REPORT_SENT_WITH_PHOTO_TEXT]);
  }
  return {
    next: 'SUPPORT_ASK_PHOTO',
    data: { fotosJuntadas: r.total },
    replies: [photoMoreText(r.total)],
  };
}
