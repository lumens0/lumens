/**
 * Foto da pauta nova (2.6): do id da mídia na Meta até a chave do arquivo limpo no storage.
 *
 *   tipo informado ─▶ baixar da Meta ─▶ removerMetadados ─▶ guardar no storage ─▶ chave
 *   (JPEG ou PNG)     (até 5 MB)        (parte 5: tira GPS, aparelho, autor)
 *
 * Nunca lança: cada falha vira um motivo, que o bot transforma em mensagem para a pessoa mandar
 * outra foto ou pular. A chave é aleatória e não leva nada de quem mandou a foto.
 */
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { removerMetadados } from './imagem';
import { ErroDeMidia, type MidiaBaixada } from './meta-midia';
import type { Storage } from './storage';

/** A task 2.6 aceita JPEG e PNG (a `removerMetadados` também aceita WebP, mas aqui não). */
const TIPOS_ACEITOS: Record<string, { formato: 'jpeg' | 'png'; extensao: string }> = {
  'image/jpeg': { formato: 'jpeg', extensao: 'jpg' },
  'image/png': { formato: 'png', extensao: 'png' },
};

export type MotivoFotoRecusada = 'formato' | 'tamanho' | 'invalida' | 'indisponivel';

export type ResultadoFoto = { ok: true; chave: string } | { ok: false; motivo: MotivoFotoRecusada };

export interface ServicoDeFotos {
  guardarFoto(midia: { id: string; mimeType: string }): Promise<ResultadoFoto>;
}

export interface DependenciasDasFotos {
  baixar(mediaId: string): Promise<MidiaBaixada>;
  storage: Storage;
  agora?: () => Date;
  /** Registra falhas de rede ou storage, sem dados da pessoa. */
  avisar?: (mensagem: string) => void;
}

/** O tipo vem com parâmetros às vezes ("image/jpeg; charset=binary"). */
const tipoBase = (mimeType: string) => mimeType.split(';')[0]?.trim().toLowerCase() ?? '';

export function criarServicoDeFotos({
  baixar,
  storage,
  agora = () => new Date(),
  avisar = () => undefined,
}: DependenciasDasFotos): ServicoDeFotos {
  return {
    async guardarFoto(midia) {
      // Confere o tipo antes de baixar: um GIF ou um vídeo nem chega a ser baixado.
      if (TIPOS_ACEITOS[tipoBase(midia.mimeType)] === undefined) {
        return { ok: false, motivo: 'formato' };
      }

      let baixada: MidiaBaixada;
      try {
        baixada = await baixar(midia.id);
      } catch (erro) {
        if (erro instanceof ErroDeMidia && erro.motivo === 'tamanho') {
          return { ok: false, motivo: 'tamanho' };
        }
        avisar(`foto: download falhou (${erro instanceof Error ? erro.message : 'erro'})`);
        return { ok: false, motivo: 'indisponivel' };
      }

      const tipo = TIPOS_ACEITOS[tipoBase(baixada.mimeType)];
      if (tipo === undefined) return { ok: false, motivo: 'formato' };

      let limpa: Buffer;
      try {
        // O conteúdo precisa ser mesmo do tipo informado: um WebP chamado de JPEG é recusado.
        const { format } = await sharp(baixada.bytes).metadata();
        if (format !== tipo.formato) return { ok: false, motivo: 'formato' };
        limpa = await removerMetadados(baixada.bytes);
      } catch {
        // Corrompido ou não é imagem (o sharp não abre, ou `removerMetadados` recusa).
        return { ok: false, motivo: 'invalida' };
      }

      const data = agora();
      const pasta = `${String(data.getUTCFullYear())}/${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
      const chave = `fotos/${pasta}/${randomUUID()}.${tipo.extensao}`;
      try {
        await storage.guardar(chave, limpa, `image/${tipo.formato}`);
      } catch (erro) {
        avisar(`foto: storage falhou (${erro instanceof Error ? erro.name : 'erro'})`);
        return { ok: false, motivo: 'indisponivel' };
      }
      return { ok: true, chave };
    },
  };
}
