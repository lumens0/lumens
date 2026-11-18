import { connection } from 'next/server';
import { buscarFoto } from '../../../../../dados/api';

type Props = { params: Promise<{ ano: string; mes: string; arquivo: string }> };

const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Foto de relato aprovado (SCRUM-263). O site não fala com o storage: pede ao back-end, que só
 * entrega a foto que está na view pública. Pendente, recusada ou inexistente dão o mesmo 404.
 */
export async function GET(_req: Request, { params }: Props) {
  await connection();
  const { ano, mes, arquivo } = await params;
  const foto = await buscarFoto(ano, mes, arquivo);
  if (!foto || !TIPOS.has(foto.tipo)) return new Response('Foto não encontrada.', { status: 404 });
  return new Response(foto.bytes, {
    headers: {
      'Content-Type': foto.tipo,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=30',
    },
  });
}
