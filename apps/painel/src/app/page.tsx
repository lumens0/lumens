import { redirect } from 'next/navigation';
import { curadorDaSessao } from '../auth';
import { sair } from './acoes';
import { Inicio } from './inicio';

export default async function Home() {
  const curador = await curadorDaSessao();
  if (!curador) redirect('/login');
  return <Inicio nome={curador.nome} sair={sair} />;
}
