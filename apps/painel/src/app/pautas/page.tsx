import { listarPautasDaCuradoria } from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../auth';
import { sair } from '../acoes';
import { Moldura } from '../moldura';
import { ListaDePautas } from './lista';

export default async function PaginaDasPautas() {
  const curador = await curadorDaSessao();
  if (!curador) redirect('/login');

  const pautas = await listarPautasDaCuradoria(servidor().db);
  return (
    <Moldura nome={curador.nome} sair={sair}>
      <ListaDePautas pautas={pautas} />
    </Moldura>
  );
}
