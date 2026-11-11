import type { Metadata } from 'next';

// Prévia do link ao colar no WhatsApp, Telegram e Facebook (SCRUM-31). As URLs aqui são
// relativas: o `metadataBase` do layout (`origemDoSite`) as torna absolutas, como o WhatsApp exige.

export const DESCRICAO_DO_SITE = 'Pautas estudantis da UFAL: da reclamação à pauta.';

/**
 * Campos comuns a toda prévia. O `openGraph` de uma página substitui o do layout inteiro (o Next
 * não mescla os campos), então quem define o seu espalha este.
 */
export const OPEN_GRAPH_BASE = { siteName: 'Lumens', locale: 'pt_BR' } as const;

/**
 * Prévia da marca, para os links sem imagem própria; a pauta usa a dela (`/p/[slug]/og.png`).
 * 1200 × 630 e menos de 300 KB: o WhatsApp corta a vertical e costuma descartar imagem pesada.
 */
export const IMAGEM_DA_MARCA = { url: '/og-lumens.png', width: 1200, height: 630, alt: 'Lumens' };

/**
 * Metadados de uma página com a prévia da marca. Sem `caminho` não há `og:url`: é o caso do layout,
 * cujo `openGraph` as páginas sem metadados próprios herdam, e um `og:url` herdado apontaria errado.
 */
export function metadadosDaMarca({
  caminho,
  title,
  description = DESCRICAO_DO_SITE,
}: {
  caminho?: string;
  title?: string;
  description?: string;
} = {}): Metadata {
  return {
    ...(title && { title }),
    description,
    openGraph: {
      ...OPEN_GRAPH_BASE,
      type: 'website',
      ...(caminho && { url: caminho }),
      ...(title && { title }),
      description,
      images: [IMAGEM_DA_MARCA],
    },
    twitter: {
      card: 'summary_large_image',
      ...(title && { title }),
      description,
      images: [IMAGEM_DA_MARCA],
    },
  };
}
