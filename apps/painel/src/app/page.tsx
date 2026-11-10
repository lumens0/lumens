import { auth } from '../auth';
import { sair } from './acoes';
import { Inicio } from './inicio';

export default async function Home() {
  const sessao = await auth();
  return <Inicio nome={sessao?.user?.name ?? 'curador'} sair={sair} />;
}
