/**
 * História 3.6 · O owner encaminha o PDF da resposta oficial (RF-B15, SCRUM-220).
 *
 *   OWNER_PATHS [Enviar resposta (PDF)] ──▶ OWNER_SEND_RESPONSE ──▶ PDF ──▶ guarda e registra
 *                                                                          └─▶ estado dos caminhos
 *
 * A resposta da ouvidoria chega ao owner pelo Fala.BR. Ele baixa o PDF e encaminha aqui; a
 * curadoria lê, resume e registra (5.4), e só então quem apoia recebe o resumo (SCRUM-222). O bot
 * não lê o PDF nem mostra o conteúdo a ninguém: pode trazer o nome de quem manifestou.
 */
import type { Db } from '@lumens/db';
import { caminhosDaPauta, registrarDocumentoDeResposta } from '@lumens/dominio';
import { z } from 'zod';
import type { MotivoPdfRecusado } from '../../fotos/resposta-pdf';
import type { StepHandler, StepResult } from './handlers';
import {
  DATA_LOST_TEXT,
  LIMPAR,
  LIMPAR_PASSO,
  LOST_OWNER_TEXT,
  conferirPautaDoOwner,
  mostrarCaminhos,
} from './minhas-pautas';

export const ASK_PDF_TEXT =
  'Mande aqui o PDF da resposta que a ouvidoria deu no Fala.BR (o arquivo, não uma foto). A curadoria vai ler e registrar o resumo, e aí quem apoiou a pauta recebe a resposta.';
export const PDF_RECEIVED_TEXT =
  'Recebi o PDF ✅ A curadoria vai ler a resposta e registrar o resumo. Quando registrar, todo mundo que apoiou a pauta recebe a resposta pelo WhatsApp.';
/** No Telegram: quem apoiou recebe pelo canal de cada um, que pode ser o WhatsApp ou o Telegram. */
export const PDF_RECEIVED_TELEGRAM_TEXT =
  'Recebi o PDF ✅ A curadoria vai ler a resposta e registrar o resumo. Quando registrar, todo mundo que apoiou a pauta recebe a resposta.';
export const NEED_PDF_TEXT =
  'Preciso do arquivo PDF da resposta. Mande o arquivo ou responda *menu*.';
export const NO_PROTOCOL_TEXT =
  'Esta pauta ainda não tem protocolo no Fala.BR, então ainda não há resposta para mandar.';
export const FILES_UNAVAILABLE_TEXT =
  'Não consigo receber arquivos agora. Tente de novo mais tarde.';

export const PDF_REFUSED_TEXT: Record<MotivoPdfRecusado, string> = {
  formato: 'Esse arquivo não é um PDF. Mande o PDF da resposta, como o Fala.BR entrega.',
  tamanho: 'O PDF passa de 10 MB. Mande um arquivo menor ou fale com a curadoria.',
  indisponivel: 'Não consegui receber o arquivo agora. Tente mandar de novo em alguns minutos.',
};

const dadosSchema = z.object({ caminhoId: z.uuid().optional() });

function caminhoIdDaConversa(data: unknown): string | undefined {
  const lidos = dadosSchema.safeParse(data);
  return lidos.success ? lidos.data.caminhoId : undefined;
}

/** Começa pelo caminho Fala.BR protocolado mais recente: é dele que a resposta deve ter vindo. */
export async function pedirResposta(
  db: Db,
  pauta: { id: string; titulo: string },
): Promise<StepResult> {
  const protocolados = (await caminhosDaPauta(db, pauta.id)).filter(
    (c) => c.tipo === 'falabr' && c.protocolo !== null,
  );
  const caminho = protocolados.at(-1);
  if (caminho === undefined) return mostrarCaminhos(db, pauta, [NO_PROTOCOL_TEXT]);
  return {
    next: 'OWNER_SEND_RESPONSE',
    data: { pautaId: pauta.id, caminhoId: caminho.id },
    replies: [ASK_PDF_TEXT],
  };
}

export const ownerSendResponse: StepHandler = async (ctx) => {
  const conferida = await conferirPautaDoOwner(ctx);
  if (!conferida.ok) return conferida.resultado;
  const { pauta, estudanteId } = conferida;
  const { db, input, respostas } = ctx;

  const caminhoId = caminhoIdDaConversa(ctx.state.data);
  if (caminhoId === undefined) return { next: 'MENU', data: LIMPAR, replies: [DATA_LOST_TEXT] };
  if (input.document === undefined)
    return { next: 'OWNER_SEND_RESPONSE', replies: [NEED_PDF_TEXT] };
  if (respostas === undefined) {
    return { next: 'OWNER_PATHS', data: LIMPAR_PASSO, replies: [FILES_UNAVAILABLE_TEXT] };
  }

  const guardado = await respostas.guardarPdf(input.document);
  if (!guardado.ok) {
    return { next: 'OWNER_SEND_RESPONSE', replies: [PDF_REFUSED_TEXT[guardado.motivo]] };
  }

  const registro = await db.transaction((tx) =>
    registrarDocumentoDeResposta(tx, { caminhoId, estudanteId, arquivoChave: guardado.chave }),
  );
  if (!registro.registrado) {
    // O arquivo já está no storage, mas sem registro não aparece para ninguém: fica órfão.
    if (registro.motivo === 'nao_e_owner')
      return { next: 'MENU', data: LIMPAR, replies: [LOST_OWNER_TEXT] };
    return { next: 'MENU', data: LIMPAR, replies: [DATA_LOST_TEXT] };
  }

  const recebido = ctx.canal === 'telegram' ? PDF_RECEIVED_TELEGRAM_TEXT : PDF_RECEIVED_TEXT;
  const estado = await mostrarCaminhos(db, pauta, [recebido]);
  return { ...estado, data: { ...estado.data, ...LIMPAR_PASSO } };
};
