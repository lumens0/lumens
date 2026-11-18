import { listarPedidosDeEdicaoPendentes } from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../auth';
import { sair } from '../acoes';
import { Moldura } from '../moldura';
import estilos from '../painel.module.css';
import { aprovarPedido, recusarPedido } from './acoes';
import { ERRO_DE_PEDIDO, FEITO_DE_PEDIDO, PedidosDeEdicao } from './pedidos';

export default async function PaginaDosPedidos({
  searchParams,
}: {
  searchParams: Promise<{ feito?: string; erro?: string }>;
}) {
  const curador = await curadorDaSessao();
  if (!curador) redirect('/login');

  const pedidos = await listarPedidosDeEdicaoPendentes(servidor().db);
  const { feito, erro } = await searchParams;
  const aviso = feito === undefined ? undefined : FEITO_DE_PEDIDO[feito];
  const falha = erro === undefined ? undefined : ERRO_DE_PEDIDO[erro];
  return (
    <Moldura nome={curador.nome} administrador={curador.papel === 'administrador'} sair={sair}>
      <h1>Pedidos de edição</h1>
      <p className={estilos.apoio}>
        O responsável por uma pauta já publicada pode pedir a mudança do título ou da descrição. O
        texto público só muda quando a curadoria aprova aqui.
      </p>
      {aviso !== undefined && (
        <p className={estilos.aviso} role="status">
          {aviso}
        </p>
      )}
      {falha !== undefined && (
        <p className={estilos.erro} role="alert">
          {falha}
        </p>
      )}
      {pedidos.length === 0 ? (
        <p className={estilos.aviso}>Nenhum pedido esperando decisão.</p>
      ) : (
        <PedidosDeEdicao
          pedidos={pedidos}
          aprovar={aprovarPedido}
          recusar={recusarPedido}
          voltar="/pedidos"
        />
      )}
    </Moldura>
  );
}
