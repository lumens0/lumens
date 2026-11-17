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

// A VM da API fica desligada quase sempre e o IP fixo não responde: sem limite, a página espera o
// timeout de conexão do fetch antes de cair no `error.tsx`.
const TEMPO_LIMITE_MS = 5000;

// Depois de um tempo esgotado, o mesmo pedido falha na hora por 10 s. Quando a página falha, o
// Next renderiza a de erro chamando o `generateMetadata` de novo, numa render nova (o `cache` do
// React não vale entre as duas): sem a pausa, a pauta esperaria os 5 s duas vezes. A pausa vale só
// para aquele caminho e modo de cache: os outros pedidos ainda podem vir do cache do Next.
const PAUSA_MS = 10_000;
const pausados = new Map<string, number>();

const chaveDaPausa = (caminho: string, fresca: boolean) => `${fresca ? 'fresca ' : ''}${caminho}`;

const pausarSeEsgotou =
  (chave: string) =>
  (erro: unknown): never => {
    if (erro instanceof Error && erro.name === 'TimeoutError') {
      const agora = Date.now();
      for (const [outra, ate] of pausados) if (ate <= agora) pausados.delete(outra);
      pausados.set(chave, agora + PAUSA_MS);
    }
    throw erro;
  };

/**
 * O cache de 30 s acompanha o `Cache-Control` da API. `fresca` lê sem ele: o card da pauta, que o
 * bot pede logo depois de um apoio, precisa do total de agora.
 */
async function buscar(caminho: string, fresca = false): Promise<Response> {
  const chave = chaveDaPausa(caminho, fresca);
  if (Date.now() < (pausados.get(chave) ?? 0))
    throw new Error(
      'API de leitura não respondeu há pouco: sem nova tentativa por alguns segundos.',
    );
  return fetch(`${urlDaApi()}${caminho}`, {
    ...(fresca ? { cache: 'no-store' } : { next: { revalidate: 30 } }),
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  }).catch(pausarSeEsgotou(chave));
}

/** Corpo JSON da resposta. O tempo limite segue valendo aqui: a API pode travar no meio do corpo. */
async function lerJson<T>(resposta: Response, caminho: string, fresca = false): Promise<T> {
  return (await resposta.json().catch(pausarSeEsgotou(chaveDaPausa(caminho, fresca)))) as T;
}

/** GET que só aceita 200. Qualquer erro sobe e cai no `error.tsx`. */
async function buscarJson<T>(caminho: string, oQue: string): Promise<T> {
  const resposta = await buscar(caminho);
  if (!resposta.ok)
    throw new Error(`API de leitura respondeu ${String(resposta.status)} para ${oQue}.`);
  return lerJson<T>(resposta, caminho);
}

/**
 * Uma pauta pública pelo slug. `null` quando a API responde 404 (não existe ou não é pública)
 * ou 400 (slug mal formado). Qualquer outro erro sobe e cai no `error.tsx`.
 */
export async function buscarPauta(
  slug: string,
  { fresca = false }: { fresca?: boolean } = {},
): Promise<PautaDetalhe | null> {
  const caminho = `/pautas/${encodeURIComponent(slug)}`;
  const resposta = await buscar(caminho, fresca);
  if (resposta.status === 404 || resposta.status === 400) return null;
  if (!resposta.ok)
    throw new Error(`API de leitura respondeu ${String(resposta.status)} para a pauta.`);
  return lerJson<PautaDetalhe>(resposta, caminho, fresca);
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
