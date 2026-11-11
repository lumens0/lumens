/**
 * História 3.4 · Registrar o protocolo do Fala.BR pelo bot (RN08, SCRUM-196).
 *
 *   OWNER_PATHS [Registrar protocolo] ──▶ OWNER_ASK_PROTOCOL ──▶ OWNER_ASK_PROTOCOL_DATE
 *                                          "00106.000123/2026-11"  "hoje" / "ontem" / dd/mm/aaaa
 *                                                                     │
 *                                    registrarProtocolo: grava o número, calcula o prazo dos 30+30
 *                                    e leva a pauta a `cobrando` ──▶ volta ao estado dos caminhos
 *
 * O dia é perguntado porque o prazo conta do dia em que a manifestação foi registrada (Lei
 * 13.460/2017, `prazo.ts`), e o owner pode estar registrando o número dias depois. A regra toda —
 * validar o número, calcular o prazo, mudar o status — é do domínio; aqui só a conversa.
 */
import type { Db } from '@lumens/db';
import { caminhosDaPauta, diaEmMaceio, formatarDia, registrarProtocolo } from '@lumens/dominio';
import { z } from 'zod';
import type { StepHandler, StepResult } from './handlers';
import { DATA_LOST_TEXT, LIMPAR, conferirPautaDoOwner, mostrarCaminhos } from './minhas-pautas';
import { normalize } from './texto';

export const ASK_PROTOCOL_TEXT =
  'Mande o número do protocolo que o Fala.BR mostrou quando você registrou a manifestação. Ex.: 00106.000123/2026-11';
export const PROTOCOL_INVALID_TEXT =
  'Isso não parece um número de protocolo: ele tem números, como 00106.000123/2026-11. Mande de novo ou responda *menu*.';
export const ASK_DATE_TEXT =
  'Em que dia você registrou a manifestação? Responda *hoje*, *ontem* ou a data (dd/mm/aaaa). O prazo da ouvidoria conta desse dia.';
export const DATE_INVALID_TEXT =
  'Não entendi a data. Responda *hoje*, *ontem* ou no formato dd/mm/aaaa.';
export const DATE_FUTURE_TEXT = 'Essa data ainda não chegou. Mande o dia em que você registrou.';
export const NO_OPEN_FALABR_TEXT =
  'Esta pauta não tem caminho Fala.BR esperando protocolo. Abra o Fala.BR primeiro.';

/** Protocolo salvo agora: o número, o prazo e o que muda na pauta. */
export function protocolSavedText(protocolo: string, prazo: string | null): string {
  const quando =
    prazo === null
      ? ''
      : `\nA ouvidoria tem até ${formatarDia(prazo)} para responder (30 dias, prorrogáveis uma vez por mais 30).`;
  return `Protocolo ${protocolo} salvo ✅${quando}\nA partir de agora a pauta aparece como em cobrança.`;
}

export function protocolAlreadySavedText(protocolo: string): string {
  return `O protocolo ${protocolo} já estava registrado neste caminho.`;
}

export function protocolDivergentText(): string {
  return 'Este caminho já tem outro protocolo registrado. Se a manifestação mudou, abra um novo caminho Fala.BR pela curadoria.';
}

const TAMANHO_MAXIMO = 60;

const dadosSchema = z.object({
  caminhoId: z.uuid().optional(),
  protocolo: z.string().optional(),
});

function dadosDoProtocolo(data: unknown): z.infer<typeof dadosSchema> {
  const lidos = dadosSchema.safeParse(data);
  return lidos.success ? lidos.data : {};
}

/** Começa o registro pelo caminho Fala.BR mais antigo que ainda não tem protocolo. */
export async function pedirProtocolo(
  db: Db,
  pauta: { id: string; titulo: string },
): Promise<StepResult> {
  const semProtocolo = (await caminhosDaPauta(db, pauta.id)).find(
    (c) => c.tipo === 'falabr' && c.protocolo === null,
  );
  if (semProtocolo === undefined) return mostrarCaminhos(db, pauta, [NO_OPEN_FALABR_TEXT]);
  return {
    next: 'OWNER_ASK_PROTOCOL',
    data: { pautaId: pauta.id, caminhoId: semProtocolo.id, protocolo: undefined },
    replies: [ASK_PROTOCOL_TEXT],
  };
}

/** Só o que dá para conferir antes do domínio: tem número e não é um parágrafo. */
function pareceProtocolo(texto: string): boolean {
  return /\d/.test(texto) && texto.length <= TAMANHO_MAXIMO;
}

export const ownerAskProtocol: StepHandler = async (ctx) => {
  const conferida = await conferirPautaDoOwner(ctx);
  if (!conferida.ok) return conferida.resultado;

  const protocolo = ctx.input.text.replace(/\s+/g, ' ').trim();
  if (!pareceProtocolo(protocolo)) {
    return { next: 'OWNER_ASK_PROTOCOL', replies: [PROTOCOL_INVALID_TEXT] };
  }
  return { next: 'OWNER_ASK_PROTOCOL_DATE', data: { protocolo }, replies: [ASK_DATE_TEXT] };
};

const MS_POR_DIA = 86_400_000;

/**
 * O dia em `YYYY-MM-DD`: "hoje", "ontem", "dd/mm/aaaa" ou "dd/mm" (este ano), e se ele ainda não
 * chegou. `undefined` quando não é data.
 */
export function diaInformado(
  resposta: string,
  agora: Date,
): { dia: string; futuro: boolean } | undefined {
  const hoje = diaEmMaceio(agora);
  const texto = normalize(resposta);
  if (texto === 'hoje') return { dia: hoje, futuro: false };
  if (texto === 'ontem') {
    return { dia: diaEmMaceio(new Date(agora.getTime() - MS_POR_DIA)), futuro: false };
  }

  const partes = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(resposta.trim());
  if (partes === null) return undefined;
  const [, d = '', m = '', a] = partes;
  const ano = a === undefined ? hoje.slice(0, 4) : a.length === 2 ? `20${a}` : a;
  const dia = `${ano}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

  // `new Date` aceita 31/02 e vira 3 de março: a volta confere que o dia existe.
  const instante = new Date(`${dia}T12:00:00Z`);
  if (Number.isNaN(instante.getTime()) || instante.toISOString().slice(0, 10) !== dia) {
    return undefined;
  }
  return { dia, futuro: dia > hoje };
}

export const ownerAskProtocolDate: StepHandler = async (ctx) => {
  const conferida = await conferirPautaDoOwner(ctx);
  if (!conferida.ok) return conferida.resultado;
  const { pauta } = conferida;
  const { db } = ctx;

  const { caminhoId, protocolo } = dadosDoProtocolo(ctx.state.data);
  if (caminhoId === undefined) return { next: 'MENU', data: LIMPAR, replies: [DATA_LOST_TEXT] };
  if (protocolo === undefined) return { next: 'OWNER_ASK_PROTOCOL', replies: [ASK_PROTOCOL_TEXT] };

  const informado = diaInformado(ctx.input.text, new Date());
  if (informado === undefined) {
    return { next: 'OWNER_ASK_PROTOCOL_DATE', replies: [DATE_INVALID_TEXT] };
  }
  if (informado.futuro) return { next: 'OWNER_ASK_PROTOCOL_DATE', replies: [DATE_FUTURE_TEXT] };

  const resultado = await db.transaction((tx) =>
    registrarProtocolo(tx, { caminhoId, protocolo, abertoEm: informado.dia }),
  );
  const limpo = (antes: string): Promise<StepResult> =>
    mostrarCaminhos(db, pauta, [antes]).then((r) => ({
      ...r,
      data: { ...r.data, caminhoId: undefined, protocolo: undefined },
    }));

  if (resultado.registrado) {
    return limpo(
      resultado.jaEstava
        ? protocolAlreadySavedText(resultado.protocolo)
        : protocolSavedText(resultado.protocolo, resultado.prazo),
    );
  }
  if (resultado.motivo === 'protocolo_invalido') {
    return {
      next: 'OWNER_ASK_PROTOCOL',
      data: { protocolo: undefined },
      replies: [PROTOCOL_INVALID_TEXT],
    };
  }
  if (resultado.motivo === 'protocolo_divergente') return limpo(protocolDivergentText());
  return { next: 'MENU', data: LIMPAR, replies: [DATA_LOST_TEXT] };
};
