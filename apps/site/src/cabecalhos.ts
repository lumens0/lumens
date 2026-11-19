/**
 * Cabeçalhos de segurança do site na Vercel (SCRUM-377). Os valores comuns são os mesmos do Caddy
 * (Caddyfile, SCRUM-303), para a VM e a Vercel responderem igual.
 */
export type Cabecalho = { key: string; value: string };

/** Fontes, scripts e estilos são do próprio site; o Next injeta scripts e estilos inline. */
const CSP_DO_SITE = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export const CABECALHOS_DE_SEGURANCA: Cabecalho[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // O site não abre dentro de página nenhuma. `frame-ancestors` não vale em report-only, então
  // fica numa política própria, aplicada de verdade.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  // O resto da política só relata, por causa do mapa e das fontes: vira bloqueio quando o
  // relatório do navegador (console) vier limpo.
  { key: 'Content-Security-Policy-Report-Only', value: CSP_DO_SITE },
];

/**
 * Cache curto das páginas públicas (SCRUM-379): o Next responde `private, no-store` nas páginas
 * dinâmicas (a home lê `searchParams`), e no pico do QR Code cada visita chamaria a API. A CDN
 * guarda por 5 s por URL (o filtro de bloco entra na chave) e serve a cópia antiga por mais 5 s
 * enquanto renova. Somado aos 10 s do cache da API (`revalidate` em dados/api.ts), o pior caso é
 * ~20 s (era 60 s): uma pauta ou apoio novo aparece em até 20 segundos. Mesmo no pico, a API vê no
 * máximo uma leitura por caminho a cada 10 s por instância, porque o cache junta as visitas.
 */
export const CACHE_PUBLICO = 'public, max-age=0, s-maxage=5, stale-while-revalidate=5';

/**
 * Na Vercel o `Cache-Control` das páginas dinâmicas é reescrito para `private, no-store` depois do
 * Next (visto em produção: o `CACHE_PUBLICO` acima não chegava ao cliente, `x-vercel-cache: MISS`
 * sempre). O `Vercel-CDN-Cache-Control` tem prioridade para a CDN da Vercel, não é reescrito e é
 * removido da resposta: o navegador continua sem guardar nada.
 */
export const CACHE_DA_CDN = 'max-age=5, stale-while-revalidate=5';

/** Páginas sem sessão que podem ir para a CDN. `/dados.csv` já tem o cache dele; `/p/:slug` é só a pauta (o card e o og.png ficam de fora). */
export const PAGINAS_EM_CACHE = ['/', '/mapa', '/conquistas', '/atividade', '/p/:slug'];
