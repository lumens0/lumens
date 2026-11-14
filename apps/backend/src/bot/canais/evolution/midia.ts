import { passaDoTamanhoMaximo } from '../../../fotos/imagem';
import { ErroDeMidia, type MidiaBaixada } from '../../../fotos/meta-midia';
import type { ClienteEvolution } from './cliente';

/**
 * Baixa a mídia que a pessoa mandou, pela referência que o webhook guardou no job
 * (`referencia` em `webhook.ts`): a mensagem inteira, com a chave e o `imageMessage` ou
 * `documentMessage`. A Evolution decifra pela própria mensagem, sem consultar o banco dela.
 *
 * Substitui o `baixarMidiaDaMeta` no canal da Evolution e devolve o mesmo `MidiaBaixada`: limpeza
 * de EXIF, tipos aceitos e storage continuam no `ServicoDeFotos`. O tamanho é conferido antes
 * (pelo `fileLength` da mensagem) e depois (pelos bytes), como na Meta.
 */
export async function baixarMidiaDaEvolution(
  referencia: string,
  chamar: ClienteEvolution,
  opcoes: { tamanhoMaximo?: number } = {},
): Promise<MidiaBaixada> {
  const passaDoLimite = (bytes: number) =>
    opcoes.tamanhoMaximo === undefined ? passaDoTamanhoMaximo(bytes) : bytes > opcoes.tamanhoMaximo;

  let mensagem: { message?: Record<string, { fileLength?: unknown; mimetype?: unknown }> };
  try {
    mensagem = JSON.parse(referencia) as typeof mensagem;
  } catch {
    throw new ErroDeMidia('indisponivel', 'Referência da mídia ilegível.');
  }
  const midia = Object.values(mensagem.message ?? {})[0];
  if (passaDoLimite(tamanhoInformado(midia?.fileLength))) {
    throw new ErroDeMidia('tamanho', 'A mídia passa do limite de tamanho.');
  }

  let resposta: { base64?: unknown; mimetype?: unknown } | null;
  try {
    resposta = (await chamar('/chat/getBase64FromMediaMessage', {
      message: mensagem,
      convertToMp4: false,
    })) as typeof resposta;
  } catch (erro) {
    // O erro da Evolution já vem sem dados da pessoa (veja `ErroDaEvolution`).
    throw new ErroDeMidia(
      'indisponivel',
      `Falha ao baixar a mídia: ${erro instanceof Error ? erro.message : 'erro desconhecido'}`,
    );
  }
  if (typeof resposta?.base64 !== 'string' || resposta.base64 === '') {
    throw new ErroDeMidia('indisponivel', 'A Evolution não devolveu a mídia.');
  }

  const bytes = Buffer.from(resposta.base64, 'base64');
  if (passaDoLimite(bytes.length)) {
    throw new ErroDeMidia('tamanho', 'A mídia passa do limite de tamanho.');
  }
  const mimeType =
    typeof resposta.mimetype === 'string'
      ? resposta.mimetype
      : typeof midia?.mimetype === 'string'
        ? midia.mimetype
        : 'application/octet-stream';
  return { bytes, mimeType };
}

/** O `fileLength` vem como número, texto ou `Long` serializado (`{ low, high }`). 0 se não der. */
function tamanhoInformado(valor: unknown): number {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string' && /^\d+$/.test(valor)) return Number(valor);
  const longo = valor as { low?: unknown; high?: unknown } | null | undefined;
  if (typeof longo?.low === 'number') {
    const alto = typeof longo.high === 'number' ? longo.high : 0;
    return alto * 2 ** 32 + (longo.low >>> 0);
  }
  return 0;
}
