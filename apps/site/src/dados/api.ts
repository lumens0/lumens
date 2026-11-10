import type {
  Atividade,
  Bloco,
  Blocos,
  Conquista,
  Conquistas,
  Pauta,
  PautaDetalhe,
  Pautas,
} from '@lumens/contratos';
import { LIMITE_MAXIMO, LIMITE_PADRAO } from '@lumens/contratos';

/** Endereço da API de leitura. Só no servidor: a variável não tem `NEXT_PUBLIC`. */
function urlDaApi(): string {
  const url = process.env.LUMENS_API_URL;
  if (!url) {
    throw new Error('LUMENS_API_URL não configurada: o site não sabe onde está a API de leitura.');
  }
  return url.replace(/\/+$/, '');
}

/** O cache de 30 s acompanha o `Cache-Control` da API. */
const buscar = (caminho: string) => fetch(`${urlDaApi()}${caminho}`, { next: { revalidate: 30 } });

/** GET que só aceita 200. Qualquer erro sobe e cai no `error.tsx`. */
async function buscarJson<T>(caminho: string, oQue: string): Promise<T> {
  const resposta = await buscar(caminho);
  if (!resposta.ok)
    throw new Error(`API de leitura respondeu ${String(resposta.status)} para ${oQue}.`);
  return (await resposta.json()) as T;
}

/**
 * Uma pauta pública pelo slug. `null` quando a API responde 404 (não existe ou não é pública)
 * ou 400 (slug mal formado). Qualquer outro erro sobe e cai no `error.tsx`.
 */
export async function buscarPauta(slug: string): Promise<PautaDetalhe | null> {
  const resposta = await buscar(`/pautas/${encodeURIComponent(slug)}`);
  if (resposta.status === 404 || resposta.status === 400) return null;
  if (!resposta.ok)
    throw new Error(`API de leitura respondeu ${String(resposta.status)} para a pauta.`);
  return (await resposta.json()) as PautaDetalhe;
}

export async function buscarBlocos(): Promise<Bloco[]> {
  return (await buscarJson<Blocos>('/blocos', 'os blocos')).itens;
}

// Trava contra uma API que nunca devolve `proximo: null`: 50 páginas de 100 são 5 mil pautas.
const MAX_PAGINAS = 50;

/**
 * Todas as pautas públicas, de todas as páginas, na ordem da API. Os totais da home somam a lista
 * inteira (e acompanham o filtro), então não dá para parar na primeira página.
 */
export async function buscarPautas(bloco?: string): Promise<Pauta[]> {
  const pautas: Pauta[] = [];
  let offset: number | null = 0;
  for (let i = 0; offset !== null && i < MAX_PAGINAS; i++) {
    const query: URLSearchParams = new URLSearchParams({
      limit: String(LIMITE_MAXIMO),
      offset: String(offset),
    });
    if (bloco) query.set('bloco', bloco);
    const pagina: Pautas = await buscarJson<Pautas>(
      `/pautas?${query.toString()}`,
      'a lista de pautas',
    );
    // Cada página tem cache próprio e a ordem por apoios muda entre elas: a mesma pauta pode vir
    // em duas páginas. Fica a primeira, para não duplicar a key nem somar os totais duas vezes.
    for (const item of pagina.itens)
      if (!pautas.some((p) => p.slug === item.slug)) pautas.push(item);
    offset = pagina.proximo;
  }
  return pautas;
}

export async function buscarConquistas(): Promise<Conquista[]> {
  return (await buscarJson<Conquistas>('/conquistas', 'as conquistas')).itens;
}

/** Eventos por página de `/atividade`: o padrão da API. */
export const EVENTOS_POR_PAGINA = LIMITE_PADRAO;

/** Uma página do feed de atividade, contada a partir de 1. */
export async function buscarAtividade(pagina: number): Promise<Atividade> {
  const query = new URLSearchParams({
    limit: String(EVENTOS_POR_PAGINA),
    offset: String((pagina - 1) * EVENTOS_POR_PAGINA),
  });
  return buscarJson<Atividade>(`/atividade?${query.toString()}`, 'a atividade');
}
