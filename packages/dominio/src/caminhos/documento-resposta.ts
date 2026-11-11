/**
 * PDF da resposta oficial encaminhado pelo owner (3.6, SCRUM-220, RF-B15).
 *
 * A resposta da ouvidoria chega ao owner pelo Fala.BR, não ao sistema: ele baixa o PDF e manda ao
 * bot. Aqui fica o registro de que o arquivo chegou, de que pauta e de que caminho ele é, e quem
 * mandou. Ler e resumir é da curadoria (5.4); o PDF não é publicado, porque a resposta pode trazer
 * o nome de quem manifestou.
 */
import {
  and,
  caminhos,
  documentosResposta,
  eq,
  isNull,
  papeisPauta,
  sql,
  type Db,
  type Tx,
} from '@lumens/db';

export type ResultadoDocumento =
  | { registrado: true; documentoId: string }
  | {
      registrado: false;
      motivo: 'caminho_inexistente' | 'caminho_sem_protocolo' | 'nao_e_owner';
    };

/**
 * Registra o PDF já guardado no storage. Só para caminho Fala.BR com protocolo — é dele que vem
 * resposta oficial — e só de owner ativo da pauta. Recusas voltam como resultado, sem exceção.
 */
export async function registrarDocumentoDeResposta(
  tx: Tx,
  {
    caminhoId,
    estudanteId,
    arquivoChave,
    agora = new Date(),
  }: { caminhoId: string; estudanteId: string; arquivoChave: string; agora?: Date },
): Promise<ResultadoDocumento> {
  const [caminho] = await tx
    .select({ pautaId: caminhos.pautaId, tipo: caminhos.tipo, protocolo: caminhos.protocolo })
    .from(caminhos)
    .where(eq(caminhos.id, caminhoId));
  if (caminho === undefined) return { registrado: false, motivo: 'caminho_inexistente' };
  if (caminho.tipo !== 'falabr' || caminho.protocolo === null) {
    return { registrado: false, motivo: 'caminho_sem_protocolo' };
  }

  const [owner] = await tx
    .select({ estudanteId: papeisPauta.estudanteId })
    .from(papeisPauta)
    .where(
      and(
        eq(papeisPauta.pautaId, caminho.pautaId),
        eq(papeisPauta.estudanteId, estudanteId),
        isNull(papeisPauta.ate),
      ),
    )
    .limit(1);
  if (owner === undefined) return { registrado: false, motivo: 'nao_e_owner' };

  const [documento] = await tx
    .insert(documentosResposta)
    .values({
      pautaId: caminho.pautaId,
      caminhoId,
      enviadoPor: estudanteId,
      arquivoChave,
      recebidoEm: agora,
    })
    .returning({ id: documentosResposta.id });
  if (documento === undefined) throw new Error('documento não registrado');
  return { registrado: true, documentoId: documento.id };
}

export interface DocumentoDaPauta {
  id: string;
  caminhoId: string;
  arquivoChave: string;
  recebidoEm: Date;
  /** Preenchida quando a curadoria registrou a resposta lida neste PDF. */
  promessaId: string | null;
}

/** Os PDFs de resposta de uma pauta, do mais novo para o mais antigo (para a curadoria). */
export async function documentosDeResposta(
  db: Db | Tx,
  pautaId: string,
): Promise<DocumentoDaPauta[]> {
  return db
    .select({
      id: documentosResposta.id,
      caminhoId: documentosResposta.caminhoId,
      arquivoChave: documentosResposta.arquivoChave,
      recebidoEm: documentosResposta.recebidoEm,
      promessaId: documentosResposta.promessaId,
    })
    .from(documentosResposta)
    .where(eq(documentosResposta.pautaId, pautaId))
    .orderBy(sql`${documentosResposta.recebidoEm} desc`);
}
