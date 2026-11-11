import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatarNumero } from '../../../componentes/BarraApoios';
import { ConteudoPauta } from '../../../componentes/pauta/ConteudoPauta';
import { buscarPauta } from '../../../dados/api';
import { FORA_DO_SITE } from '../../../dados/pautas-publicas';
import { OPEN_GRAPH_BASE } from '../../../metadados';
import { origemDoSite } from '../../../origem';
import { TAMANHO } from './card';

type Props = { params: Promise<{ slug: string }> };

/** Pauta pública ou 404. A API já filtra; o `FORA_DO_SITE` é uma segunda barreira. */
async function pautaOu404(slug: string) {
  const pauta = await buscarPauta(slug);
  if (!pauta || FORA_DO_SITE.has(pauta.status)) notFound();
  return pauta;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const pauta = await pautaOu404((await params).slug);
  // Imagem horizontal: a prévia do link no WhatsApp corta a vertical (SCRUM-55).
  const imagem = {
    url: new URL(`/p/${pauta.slug}/og.png`, origemDoSite()).href,
    ...TAMANHO.og,
    alt: pauta.titulo,
  };
  // Os números na descrição da prévia (SCRUM-31): é o que faz clicar.
  const description = `${formatarNumero(pauta.apoios)} de ${formatarNumero(pauta.meta)} apoios. Apoie você também.`;
  return {
    title: pauta.titulo,
    description,
    openGraph: {
      ...OPEN_GRAPH_BASE,
      type: 'article',
      url: `/p/${pauta.slug}`,
      description,
      images: [imagem],
    },
    twitter: { card: 'summary_large_image', description, images: [imagem] },
  };
}

export default async function PaginaPauta({ params }: Props) {
  const pauta = await pautaOu404((await params).slug);
  return <ConteudoPauta pauta={pauta} />;
}
