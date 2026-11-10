import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ConteudoPauta } from '../../../componentes/pauta/ConteudoPauta';
import { buscarPauta } from '../../../dados/api';
import { FORA_DO_SITE } from '../../../dados/pautas-publicas';

type Props = { params: Promise<{ slug: string }> };

/** Pauta pública ou 404. A API já filtra; o `FORA_DO_SITE` é uma segunda barreira. */
async function pautaOu404(slug: string) {
  const pauta = await buscarPauta(slug);
  if (!pauta || FORA_DO_SITE.has(pauta.status)) notFound();
  return pauta;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const pauta = await pautaOu404((await params).slug);
  return { title: pauta.titulo };
}

export default async function PaginaPauta({ params }: Props) {
  const pauta = await pautaOu404((await params).slug);
  return <ConteudoPauta pauta={pauta} />;
}
