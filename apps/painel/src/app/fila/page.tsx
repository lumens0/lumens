import { listarFilaDeCuradoria } from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../auth';
import { sair } from '../acoes';
import { Moldura } from '../moldura';
import { Fila } from './fila';

export default async function PaginaDaFila({
  searchParams,
}: {
  searchParams: Promise<{ feito?: string }>;
}) {
  const curador = await curadorDaSessao();
  if (!curador) redirect('/login');

  const pautas = await listarFilaDeCuradoria(servidor().db);
  return (
    <Moldura nome={curador.nome} sair={sair}>
      <Fila pautas={pautas} feito={(await searchParams).feito} />
    </Moldura>
  );
}
