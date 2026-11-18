/**
 * Cabeçalhos de segurança do painel na Vercel (SCRUM-377). Os valores comuns são os mesmos do
 * Caddy (Caddyfile, SCRUM-303), para a VM e a Vercel responderem igual.
 */
export type Cabecalho = { key: string; value: string };

/**
 * Tudo do painel vem da própria origem: fotos e PDF passam por /curadoria/arquivos. O Next injeta
 * scripts e estilos inline, então `unsafe-inline`; `frame-src 'self'` é o PDF da resposta, mostrado
 * num iframe ao lado do formulário da promessa.
 */
const CSP_DO_PAINEL = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Só o próprio painel o abre num quadro (clickjacking nos botões de aprovar e recusar).
  "frame-ancestors 'self'",
].join('; ');

export const CABECALHOS_DE_SEGURANCA: Cabecalho[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: CSP_DO_PAINEL },
];
