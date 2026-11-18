import { resumoDaCuradoria, visaoGeralDaCuradoria } from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../auth';
import { sair } from './acoes';
import { Inicio } from './inicio';
import { Moldura } from './moldura';

export default async function Home() {
  const curador = await curadorDaSessao();
  if (!curador) redirect('/login');

  const { db } = servidor();
  const agora = new Date();
  const [resumo, visao] = await Promise.all([
    resumoDaCuradoria(db, agora),
    visaoGeralDaCuradoria(db, agora),
  ]);
  return (
    <Moldura nome={curador.nome} administrador={curador.papel === 'administrador'} sair={sair}>
      <Inicio resumo={resumo} visao={visao} />
    </Moldura>
  );
}
