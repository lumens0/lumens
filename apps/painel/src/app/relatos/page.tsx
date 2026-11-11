import { listarRelatosPendentes } from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../auth';
import { sair } from '../acoes';
import { Moldura } from '../moldura';
import { aprovar, recusar } from './acoes';
import { Relatos } from './relatos';

export default async function PaginaDosRelatos({
  searchParams,
}: {
  searchParams: Promise<{ feito?: string; erro?: string }>;
}) {
  const curador = await curadorDaSessao();
  if (!curador) redirect('/login');

  const pautas = await listarRelatosPendentes(servidor().db);
  const { feito, erro } = await searchParams;
  return (
    <Moldura nome={curador.nome} sair={sair}>
      <Relatos pautas={pautas} feito={feito} erro={erro} aprovar={aprovar} recusar={recusar} />
    </Moldura>
  );
}
