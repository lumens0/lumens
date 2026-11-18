/**
 * Resposta à conferência da promessa, o "Foi feito?" (SCRUM-293, RN10).
 *
 *   aviso lumens_conferencia ─▶ toque em Sim / Em parte / Não ─▶ payload conferencia:<promessa>:<i>
 *                                                                 │
 *   "sim" digitado (Evolution, ou quem não toca no botão) ───────┤
 *                                                                 ▼
 *                         registrarRespostaConferencia ─▶ confirmação ou recusa
 *
 * Roda antes do passo da conversa, em qualquer passo: o payload de um botão de aviso nunca pode
 * virar resposta à pergunta em aberto (o título de uma pauta nova, por exemplo). A conversa fica
 * onde estava: a pessoa responde à conferência e continua o que fazia.
 */
import { and, apoios, eq, isNull, pautas, promessas, sql, type Db } from '@lumens/db';
import {
  PRIORIDADE,
  interpretarResposta,
  registrarRespostaConferencia,
  type MotivoRecusa,
  type RespostaConferencia,
} from '@lumens/dominio';
import { MODELOS } from '../whatsapp/modelos';
import { estudanteVerificado } from './estudante';
import type { Step } from './steps';

/**
 * Resposta rápida de um aviso da fila: `tipo:aviso:índice` (`payloadDaResposta`, em
 * `envio/aviso.ts`). O `aviso` pode ter dois-pontos: a segunda rodada da conferência usa
 * `<promessa>:reaberta`.
 */
const RESPOSTA_DE_AVISO = new RegExp(`^(${Object.keys(PRIORIDADE).join('|')}):(\\S+):(\\d+)$`);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const AVISO_SEM_RESPOSTA_TEXT =
  'Ainda não consigo registrar essa resposta pelo botão. Mande menu para ver as opções.';

export const CONFERENCIA_REGISTRADA_TEXT = (titulo: string, resposta: string) =>
  `Anotei sua resposta sobre a pauta "${titulo}": ${resposta}. Obrigado! Se mudar de ideia, é só responder de novo enquanto a conferência estiver aberta.`;

export const CONFERENCIA_TROCADA_TEXT = (titulo: string, resposta: string) =>
  `Troquei sua resposta sobre a pauta "${titulo}" para: ${resposta}.`;

export const RECUSA_DA_CONFERENCIA_TEXT: Readonly<Record<MotivoRecusa, string>> = {
  nao_apoiou:
    'Só quem apoiou a pauta responde à conferência, e não achei o seu apoio nela. Mande menu para ver as opções.',
  conferencia_encerrada:
    'A conferência dessa promessa já terminou, então a resposta não conta mais. O resultado aparece na página da pauta.',
  conferencia_nao_abriu: 'A conferência dessa promessa ainda não começou.',
  promessa_inexistente: 'Não achei a conferência desse aviso. Mande menu para ver as opções.',
};

/** O texto de cada botão do modelo aprovado decide o valor: a ordem dos botões vem dele. */
const BOTOES_DA_CONFERENCIA: readonly (RespostaConferencia | null)[] =
  MODELOS.lumens_conferencia.botoes.map((b) => interpretarResposta(b.texto));

const ROTULO: Readonly<Record<RespostaConferencia, string>> = {
  sim: 'Sim',
  em_parte: 'Em parte',
  nao: 'Não',
};

/**
 * Passos em que nenhuma pergunta está em aberto. Só neles um "sim" digitado é lido como resposta à
 * conferência: no meio de um fluxo, o "sim" é da pergunta do fluxo.
 */
const PASSOS_SEM_PERGUNTA: readonly Step[] = ['GREETING', 'MENU'];

export type EntradaDeConferencia =
  | { tipo: 'botao'; promessaId: string; resposta: RespostaConferencia }
  | { tipo: 'outro_aviso' }
  | { tipo: 'digitada'; resposta: RespostaConferencia };

/**
 * Reconhece a resposta à conferência na mensagem. Pura.
 *
 * - Payload de botão da conferência: vale em qualquer passo.
 * - Payload de botão de outro aviso: também é interceptado, para nunca cair no passo atual.
 * - Digitada ("sim", "em parte", "não"): só sem pergunta em aberto. Número não conta: "1" a "4"
 *   são as opções do menu principal.
 */
export function entradaDeConferencia(texto: string, passo: Step): EntradaDeConferencia | null {
  const botao = RESPOSTA_DE_AVISO.exec(texto.trim());
  if (botao) {
    const [, tipo = '', aviso = '', indice = ''] = botao;
    if (tipo !== 'conferencia') return { tipo: 'outro_aviso' };
    const promessaId = aviso.replace(/:reaberta$/, '');
    const resposta = BOTOES_DA_CONFERENCIA[Number(indice)] ?? null;
    if (!UUID.test(promessaId) || resposta === null) return { tipo: 'outro_aviso' };
    return { tipo: 'botao', promessaId, resposta };
  }
  // Número com qualquer pontuação ("1.", "2)", "(3)") é opção do menu, não voto: o
  // `interpretarResposta` ignora a pontuação e leria "1." como "sim".
  if (!PASSOS_SEM_PERGUNTA.includes(passo) || /^\d+$/.test(texto.replace(/[^\p{L}\p{N}]/gu, ''))) {
    return null;
  }
  const resposta = interpretarResposta(texto);
  return resposta === null ? null : { tipo: 'digitada', resposta };
}

/**
 * A conferência aberta mais recente entre as pautas que a pessoa apoiou: é a do aviso que ela
 * acabou de receber. Com mais de uma aberta ao mesmo tempo, o botão do aviso é o que escolhe.
 */
async function conferenciaAbertaDe(db: Db, estudanteId: string, agora: Date) {
  const instante = agora.toISOString();
  const [linha] = await db
    .select({ id: promessas.id })
    .from(promessas)
    .innerJoin(
      apoios,
      and(eq(apoios.pautaId, promessas.pautaId), eq(apoios.estudanteId, estudanteId)),
    )
    .where(
      and(
        isNull(promessas.resultado),
        // Só vale para quem apoiou até a abertura (mesmo corte de `encerrarConferencia`).
        sql`${apoios.criadoEm} <= ${promessas.conferenciaAbreEm}`,
        sql`${promessas.conferenciaAbreEm} <= ${instante}::timestamptz`,
        sql`${promessas.conferenciaFechaEm} >= ${instante}::timestamptz`,
      ),
    )
    .orderBy(sql`${promessas.conferenciaAbreEm} desc`)
    .limit(1);
  return linha?.id;
}

async function tituloDaPauta(db: Db, promessaId: string): Promise<string> {
  const [linha] = await db
    .select({ titulo: pautas.titulo })
    .from(promessas)
    .innerJoin(pautas, eq(pautas.id, promessas.pautaId))
    .where(eq(promessas.id, promessaId));
  return linha?.titulo ?? '';
}

/**
 * Registra a resposta e devolve o que dizer à pessoa. `null` quando a mensagem não era resposta à
 * conferência (o "sim" digitado de quem não tem conferência aberta segue para a conversa).
 * `cadastrado` diz se a pessoa é estudante verificado: só para ela a conversa pode ser guardada (5.7).
 */
export async function responderConferencia(
  db: Db,
  phoneHmac: string,
  entrada: EntradaDeConferencia,
  agora = new Date(),
): Promise<{ respostas: string[]; cadastrado: boolean } | null> {
  const estudanteId = await estudanteVerificado(db, phoneHmac);
  const cadastrado = estudanteId !== undefined;
  const dizer = (...respostas: string[]) => ({ respostas, cadastrado });
  if (entrada.tipo === 'outro_aviso') return dizer(AVISO_SEM_RESPOSTA_TEXT);

  let promessaId: string | undefined;
  if (entrada.tipo === 'botao') {
    if (estudanteId === undefined) return dizer(RECUSA_DA_CONFERENCIA_TEXT.nao_apoiou);
    promessaId = entrada.promessaId;
  } else {
    if (estudanteId === undefined) return null;
    promessaId = await conferenciaAbertaDe(db, estudanteId, agora);
    if (promessaId === undefined) return null;
  }

  const id = promessaId;
  const resultado = await db.transaction((tx) =>
    registrarRespostaConferencia(tx, {
      promessaId: id,
      estudanteId,
      resposta: entrada.resposta,
      agora,
    }),
  );
  if (!resultado.registrada) return dizer(RECUSA_DA_CONFERENCIA_TEXT[resultado.motivo]);

  const titulo = await tituloDaPauta(db, id);
  const rotulo = ROTULO[entrada.resposta];
  if (resultado.alterouResposta) return dizer(CONFERENCIA_TROCADA_TEXT(titulo, rotulo));
  return dizer(CONFERENCIA_REGISTRADA_TEXT(titulo, rotulo));
}
