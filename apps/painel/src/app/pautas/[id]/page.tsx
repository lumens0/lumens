import {
  detalharPautaDaCuradoria,
  listarBlocos,
  listarLinhaDoTempo,
  pedidosPendentesDaPauta,
} from '@lumens/dominio';
import { notFound, redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../../auth';
import { sair } from '../../acoes';
import { recusarFoto } from '../../fotos/acoes';
import { Moldura } from '../../moldura';
import { aprovarPedido, recusarPedido } from '../../pedidos/acoes';
import {
  ajustarMeta,
  aprovar,
  atualizarUrgencia,
  corrigirBloco,
  definirCategoria,
  recusar,
  recusarRelatoDeOrigem,
} from './acoes';
import { UUID } from './decisoes';
import { Pauta } from './pauta';
import { corrigirProtocolo, prorrogarPrazo, remarcarPromessa } from './ajustes-de-prazo-acoes';

export default async function PaginaDaPauta({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; feito?: string; avisados?: string; linha?: string }>;
}) {
  const curador = await curadorDaSessao();
  if (!curador) redirect('/login');

  const { id } = await params;
  const pauta = UUID.test(id) ? await detalharPautaDaCuradoria(servidor().db, id) : undefined;
  if (!pauta) notFound();

  const { erro, feito, avisados, linha } = await searchParams;
  const numero = Number(avisados);
  const avisadosValido = feito === 'promessa' && Number.isInteger(numero) && numero >= 0;
  return (
    <Moldura nome={curador.nome} administrador={curador.papel === 'administrador'} sair={sair}>
      <Pauta
        pauta={pauta}
        erro={erro}
        feito={feito}
        eventos={await listarLinhaDoTempo(servidor().db, id)}
        blocos={await listarBlocos(servidor().db)}
        avisados={avisadosValido ? numero : undefined}
        categoriaSalva={feito === 'categoria'}
        aprovar={aprovar}
        recusar={recusar}
        definirCategoria={definirCategoria}
        atualizarUrgencia={atualizarUrgencia}
        corrigirBloco={corrigirBloco}
        ajustarMeta={ajustarMeta}
        prorrogarPrazo={prorrogarPrazo}
        corrigirProtocolo={corrigirProtocolo}
        remarcarPromessa={remarcarPromessa}
        recusarRelatoDeOrigem={recusarRelatoDeOrigem}
        linhaAberta={linha === 'aberta'}
        recusarFoto={recusarFoto}
        pedidosDeEdicao={await pedidosPendentesDaPauta(servidor().db, id)}
        aprovarPedido={aprovarPedido}
        recusarPedido={recusarPedido}
      />
    </Moldura>
  );
}
