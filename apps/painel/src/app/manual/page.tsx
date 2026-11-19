import { redirect } from 'next/navigation';
import { curadorDaSessao } from '../../auth';
import { sair } from '../acoes';
import { Moldura } from '../moldura';
import { ManualDaCuradoria } from './manual';

export const metadata = { title: 'Manual da curadoria · Lumens' };

export default async function PaginaDoManual() {
  const curador = await curadorDaSessao();
  if (!curador) redirect('/login');
  const administrador = curador.papel === 'administrador';
  return (
    <Moldura nome={curador.nome} administrador={administrador} sair={sair}>
      <ManualDaCuradoria administrador={administrador} />
    </Moldura>
  );
}
