import { listarPautasDaCuradoria } from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../auth';
import { sair } from '../acoes';
import { Moldura } from '../moldura';
import { ListaDePautas } from './lista';
import { STATUS } from './status';

export default async function PaginaDasPautas({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const curador = await curadorDaSessao();
  if (!curador) redirect('/login');

  const parametros = await searchParams;
  const statusSolicitado = parametros.status ?? 'em_curadoria';
  const status =
    statusSolicitado === 'todas' || Object.hasOwn(STATUS, statusSolicitado)
      ? statusSolicitado
      : 'em_curadoria';
  const filtro = {
    ...(status !== 'todas' && Object.hasOwn(STATUS, status)
      ? { status: status as keyof typeof STATUS }
      : {}),
    ...(parametros.q === undefined ? {} : { q: parametros.q }),
  };
  const pautas = await listarPautasDaCuradoria(servidor().db, new Date(), filtro);
  return (
    <Moldura nome={curador.nome} administrador={curador.papel === 'administrador'} sair={sair}>
      <ListaDePautas pautas={pautas} status={status} q={parametros.q ?? ''} />
    </Moldura>
  );
}
