import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { buscarPautas } from '../dados/api';
import { pautasPublicas } from '../dados/pautas-publicas';
import { origemDoSite } from '../origem';

const PAGINAS = ['/', '/pautas', '/conquistas', '/atividade', '/mapa', '/manual', '/privacidade'];

/**
 * Páginas públicas e as pautas. Com a API fora do ar (a VM fica desligada quase sempre), responde
 * só as páginas fixas: o sitemap não pode virar erro.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Na hora do pedido, não no build: a API fica desligada durante o build.
  await connection();
  let pautas: string[] = [];
  try {
    pautas = pautasPublicas(await buscarPautas()).map((p) => `/p/${p.slug}`);
  } catch (erro) {
    console.error('Sitemap sem as pautas: a API de leitura falhou.', erro);
  }
  return [...PAGINAS, ...pautas].map((caminho) => ({
    url: new URL(caminho, origemDoSite()).href,
  }));
}
