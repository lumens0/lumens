/**
 * Foto da conquista (SCRUM-394): confere, tira os metadados e devolve um JPEG pronto para guardar.
 *
 * Mesma regra das fotos do bot (`apps/backend/src/fotos/imagem.ts`): o sharp não copia EXIF, GPS,
 * XMP nem perfil para a saída, e a orientação do EXIF é aplicada nos pixels antes de descartada.
 * Aqui a saída é sempre JPEG (o card feito pelo satori só abre JPEG e PNG) e o maior lado fica em
 * até 1600 px. NÃO usar `.withMetadata()`, `.keepMetadata()` nem `.keepExif()`.
 */
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

/** Mesmo limite das fotos do bot: 5 MB. */
export const FOTO_DA_CONQUISTA_MAXIMO = 5 * 1024 * 1024;
/** Mesmo limite de pixels das fotos do bot (SCRUM-304): o sharp recusa já no cabeçalho. */
const LIMITE_DE_PIXELS = 40_000_000;
const LADO_MAXIMO = 1600;
const FORMATOS = new Set(['jpeg', 'png', 'webp']);

export type MotivoDaFoto = 'formato' | 'tamanho' | 'invalida';

export type FotoPreparada =
  { ok: true; bytes: Buffer; contentType: 'image/jpeg' } | { ok: false; motivo: MotivoDaFoto };

export async function prepararFotoDaConquista(entrada: Buffer): Promise<FotoPreparada> {
  if (entrada.length === 0) return { ok: false, motivo: 'invalida' };
  if (entrada.length > FOTO_DA_CONQUISTA_MAXIMO) return { ok: false, motivo: 'tamanho' };
  try {
    const { format } = await sharp(entrada, { limitInputPixels: LIMITE_DE_PIXELS }).metadata();
    if (!FORMATOS.has(format)) return { ok: false, motivo: 'formato' };
    const bytes = await sharp(entrada, { limitInputPixels: LIMITE_DE_PIXELS, failOn: 'error' })
      .rotate()
      // PNG com transparência vira JPEG sobre branco, e não sobre preto.
      .flatten({ background: '#ffffff' })
      .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    return { ok: true, bytes, contentType: 'image/jpeg' };
  } catch {
    // Corrompido, não é imagem ou tem pixels demais.
    return { ok: false, motivo: 'invalida' };
  }
}

/** `fotos/AAAA/MM/<uuid>.jpg`: o mesmo formato do bot, que a rota pública e a do painel aceitam. */
export function chaveDaFotoDaConquista(agora: Date = new Date()): string {
  const mes = String(agora.getUTCMonth() + 1).padStart(2, '0');
  return `fotos/${String(agora.getUTCFullYear())}/${mes}/${randomUUID()}.jpg`;
}
