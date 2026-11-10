import { eq, pautas } from '@lumens/db';
import { listarLinhaDoTempo } from '@lumens/dominio';
import { notFound, redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../../../auth';
import { UUID } from '../../../curadoria/pautas/[id]/eventos/eventos';
import { LinhaDoTempo } from './linha';

export default async function PaginaDaLinhaDoTempo({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Sessão antes de olhar o id: quem não entrou não descobre se a pauta existe.
  const curador = await curadorDaSessao();
  if (!curador) redirect('/login');

  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { db } = servidor();
  const [pauta] = await db.select({ titulo: pautas.titulo }).from(pautas).where(eq(pautas.id, id));
  if (!pauta) notFound();

  return <LinhaDoTempo titulo={pauta.titulo} eventos={await listarLinhaDoTempo(db, id)} />;
}
