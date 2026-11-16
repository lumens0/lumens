import { detalharPautaDaCuradoria, listarLinhaDoTempo } from '@lumens/dominio';
import { notFound, redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../../auth';
import { sair } from '../../acoes';
import { Moldura } from '../../moldura';
import { aprovar, atualizarUrgencia, definirCategoria, recusar } from './acoes';
import { UUID } from './decisoes';
import { Pauta } from './pauta';

export default async function PaginaDaPauta({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; feito?: string; avisados?: string }>;
}) {
  const curador = await curadorDaSessao();
  if (!curador) redirect('/login');

  const { id } = await params;
  const pauta = UUID.test(id) ? await detalharPautaDaCuradoria(servidor().db, id) : undefined;
  if (!pauta) notFound();

  const { erro, feito, avisados } = await searchParams;
  const numero = Number(avisados);
  const avisadosValido = feito === 'promessa' && Number.isInteger(numero) && numero >= 0;
  return (
    <Moldura nome={curador.nome} administrador={curador.papel === 'administrador'} sair={sair}>
      <Pauta
        pauta={pauta}
        erro={erro}
        feito={feito}
        eventos={await listarLinhaDoTempo(servidor().db, id)}
        avisados={avisadosValido ? numero : undefined}
        categoriaSalva={feito === 'categoria'}
        aprovar={aprovar}
        recusar={recusar}
        definirCategoria={definirCategoria}
        atualizarUrgencia={atualizarUrgencia}
      />
    </Moldura>
  );
}
