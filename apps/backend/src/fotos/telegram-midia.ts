/**
 * Baixa a foto ou o PDF que a pessoa mandou pelo Telegram. O par do `baixarMidiaDaMeta`, com o
 * mesmo contrato (`MidiaBaixada`, `ErroDeMidia`), para os serviços de fotos e de respostas não
 * saberem de onde veio o arquivo.
 *
 *   1. getFile(file_id)                         → { file_path, file_size }
 *   2. GET /file/bot<token>/<file_path>         → os bytes
 *
 * A Bot API só entrega arquivos de até 20 MB: acima disso o `getFile` responde 400 "file is too big".
 * O tipo vem da extensão do `file_path` (o Telegram não informa no `getFile`); quem chama confere
 * o conteúdo de verdade (o sharp, a assinatura do PDF).
 */
import type { ApiDoTelegram } from '../bot/telegram/api';
import { ErroDaApiDoTelegram } from '../bot/telegram/api';
import { passaDoTamanhoMaximo } from './imagem';
import { ErroDeMidia, type MidiaBaixada } from './meta-midia';

/** Limite de download da Bot API. */
export const LIMITE_DO_TELEGRAM = 20 * 1024 * 1024;

const TIPO_DA_EXTENSAO: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

export interface OpcoesDoTelegram {
  api: Pick<ApiDoTelegram, 'chamar' | 'baixarArquivo'>;
  /** Bytes. O padrão é o da foto; o PDF da resposta oficial usa o dele. */
  tamanhoMaximo?: number;
}

interface Arquivo {
  file_path?: string;
  file_size?: number;
}

export async function baixarMidiaDoTelegram(
  fileId: string,
  { api, tamanhoMaximo }: OpcoesDoTelegram,
): Promise<MidiaBaixada> {
  const passaDoLimite = (bytes: number) =>
    bytes > LIMITE_DO_TELEGRAM ||
    (tamanhoMaximo === undefined ? passaDoTamanhoMaximo(bytes) : bytes > tamanhoMaximo);

  let arquivo: Arquivo;
  try {
    arquivo = await api.chamar<Arquivo>('getFile', { file_id: fileId });
  } catch (erro) {
    if (erro instanceof ErroDaApiDoTelegram && /too big/i.test(erro.descricao)) {
      throw new ErroDeMidia('tamanho', 'A mídia passa do limite de tamanho.');
    }
    // A mensagem do ErroDaApiDoTelegram não leva o token.
    throw new ErroDeMidia('indisponivel', `Falha ao consultar a mídia: ${mensagemDe(erro)}`);
  }
  if (passaDoLimite(arquivo.file_size ?? 0)) {
    throw new ErroDeMidia('tamanho', 'A mídia passa do limite de tamanho.');
  }
  if (arquivo.file_path === undefined) {
    throw new ErroDeMidia('indisponivel', 'O Telegram não devolveu o caminho do arquivo.');
  }

  let bytes: Buffer;
  try {
    bytes = await api.baixarArquivo(arquivo.file_path);
  } catch (erro) {
    throw new ErroDeMidia('indisponivel', `Falha ao baixar a mídia: ${mensagemDe(erro)}`);
  }
  if (passaDoLimite(bytes.length)) {
    throw new ErroDeMidia('tamanho', 'A mídia passa do limite de tamanho.');
  }
  const extensao = arquivo.file_path.split('.').pop()?.toLowerCase() ?? '';
  return { bytes, mimeType: TIPO_DA_EXTENSAO[extensao] ?? 'application/octet-stream' };
}

/** Só a mensagem dos erros desta API (sem token); de qualquer outro, só o nome. */
function mensagemDe(erro: unknown): string {
  if (erro instanceof ErroDaApiDoTelegram) return erro.message;
  return erro instanceof Error ? erro.name : 'erro desconhecido';
}
