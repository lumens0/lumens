import { resumoDaCuradoria } from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../auth';
import { sair } from './acoes';
import { Inicio } from './inicio';
import { Moldura } from './moldura';

export default async function Home() {
  const curador = await curadorDaSessao();
  if (!curador) redirect('/login');

  const resumo = await resumoDaCuradoria(servidor().db);
  return (
    <Moldura nome={curador.nome} administrador={curador.papel === 'administrador'} sair={sair}>
      <Inicio resumo={resumo} />
    </Moldura>
  );
}
