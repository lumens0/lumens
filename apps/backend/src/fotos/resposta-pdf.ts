/**
 * PDF da resposta oficial (3.6, SCRUM-220): do id da mídia na Meta até a chave do arquivo no
 * storage.
 *
 *   tipo informado ─▶ baixar da Meta ─▶ é PDF de verdade? ─▶ guardar no storage ─▶ chave
 *   (application/pdf)  (até 10 MB)       (começa com %PDF-)     (respostas/aaaa/mm/…)
 *
 * Nunca lança: cada falha vira um motivo, que o bot transforma em mensagem para o owner mandar de
 * novo. A chave é aleatória e não leva nada de quem mandou nem o nome original do arquivo.
 *
 * O PDF vai para o mesmo bucket das fotos, em outra pasta, e **não é público**: a resposta da
 * ouvidoria pode trazer o nome de quem manifestou. Quem lê é a curadoria.
 */
import { randomUUID } from 'node:crypto';
import { ErroDeMidia, type MidiaBaixada } from './meta-midia';
import type { Storage } from './storage';

/** 10 MB: uma resposta de ouvidoria escaneada cabe com folga, e a Meta aceita até 100 MB. */
export const TAMANHO_MAXIMO_PDF = 10 * 1024 * 1024;

/** Todo PDF começa com esta assinatura; o que não começa não é PDF, diga o tipo o que disser. */
const ASSINATURA_PDF = Buffer.from('%PDF-', 'ascii');

export type MotivoPdfRecusado = 'formato' | 'tamanho' | 'indisponivel';

export type ResultadoPdf = { ok: true; chave: string } | { ok: false; motivo: MotivoPdfRecusado };

export interface ServicoDeRespostas {
  guardarPdf(midia: { id: string; mimeType: string }): Promise<ResultadoPdf>;
}

export interface DependenciasDasRespostas {
  /** Baixa a mídia já com o limite do PDF. */
  baixar: (mediaId: string) => Promise<MidiaBaixada>;
  storage: Storage;
  agora?: () => Date;
  /** Registra falhas de rede ou storage, sem dados da pessoa. */
  avisar?: (mensagem: string) => void;
}

const tipoBase = (mimeType: string) => mimeType.split(';')[0]?.trim().toLowerCase() ?? '';

export function criarServicoDeRespostas({
  baixar,
  storage,
  agora = () => new Date(),
  avisar = () => undefined,
}: DependenciasDasRespostas): ServicoDeRespostas {
  return {
    async guardarPdf(midia) {
      // Confere o tipo antes de baixar: uma foto ou um .docx nem chega a ser baixado.
      if (tipoBase(midia.mimeType) !== 'application/pdf') return { ok: false, motivo: 'formato' };

      let baixada: MidiaBaixada;
      try {
        baixada = await baixar(midia.id);
      } catch (erro) {
        if (erro instanceof ErroDeMidia && erro.motivo === 'tamanho') {
          return { ok: false, motivo: 'tamanho' };
        }
        avisar(`pdf: download falhou (${erro instanceof Error ? erro.message : 'erro'})`);
        return { ok: false, motivo: 'indisponivel' };
      }

      if (!baixada.bytes.subarray(0, ASSINATURA_PDF.length).equals(ASSINATURA_PDF)) {
        return { ok: false, motivo: 'formato' };
      }

      const data = agora();
      const pasta = `${String(data.getUTCFullYear())}/${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
      const chave = `respostas/${pasta}/${randomUUID()}.pdf`;
      try {
        await storage.guardar(chave, baixada.bytes, 'application/pdf');
      } catch (erro) {
        avisar(`pdf: storage falhou (${erro instanceof Error ? erro.name : 'erro'})`);
        return { ok: false, motivo: 'indisponivel' };
      }
      return { ok: true, chave };
    },
  };
}
