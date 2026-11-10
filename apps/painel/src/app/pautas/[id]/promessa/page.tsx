import { buscarPautaDaCuradoria } from '@lumens/dominio';
import { notFound, redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../../../auth';
import { sair } from '../../../acoes';
import { Moldura } from '../../../moldura';
import { UUID } from '../decisoes';
import { registrar } from './acoes';
import { FormularioDaPromessa } from './formulario';
import { hojeEmMaceio } from './registro';

export default async function PaginaDaPromessa({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const curador = await curadorDaSessao();
  if (!curador) redirect('/login');

  const { id } = await params;
  const pauta = UUID.test(id) ? await buscarPautaDaCuradoria(servidor().db, id) : undefined;
  if (!pauta) notFound();

  return (
    <Moldura nome={curador.nome} sair={sair}>
      <FormularioDaPromessa
        pauta={pauta}
        hoje={hojeEmMaceio()}
        erro={(await searchParams).erro}
        registrar={registrar}
      />
    </Moldura>
  );
}
