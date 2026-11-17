import { listarCuradores } from '@lumens/dominio';
import { notFound, redirect } from 'next/navigation';
import { chavesDeCurador, curadorDaSessao, servidor } from '../../auth';
import { sair } from '../acoes';
import { Moldura } from '../moldura';
import { adicionar, desativar, reativar } from './acoes';
import { Curadores } from './curadores';

export default async function PaginaDosCuradores({
  searchParams,
}: {
  searchParams: Promise<{ feito?: string; erro?: string }>;
}) {
  const curador = await curadorDaSessao();
  if (!curador) redirect('/login');
  // Curador comum não sabe que a tela existe: o mesmo 404 de qualquer endereço que não há.
  if (curador.papel !== 'administrador') notFound();

  const lista = await listarCuradores(servidor().db, chavesDeCurador());
  const { feito, erro } = await searchParams;
  return (
    <Moldura nome={curador.nome} administrador sair={sair}>
      <Curadores
        curadores={lista}
        eu={curador.id}
        feito={feito}
        erro={erro}
        adicionar={adicionar}
        desativar={desativar}
        reativar={reativar}
      />
    </Moldura>
  );
}
