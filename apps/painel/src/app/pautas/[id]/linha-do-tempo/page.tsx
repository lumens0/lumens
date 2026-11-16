import { permanentRedirect } from 'next/navigation';

/** A linha do tempo virou uma seção da tela da pauta (SCRUM-286); links antigos continuam valendo. */
export default async function LinhaDoTempo({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<never> {
  const { id } = await params;
  permanentRedirect(`/pautas/${encodeURIComponent(id)}#linha-do-tempo`);
}
