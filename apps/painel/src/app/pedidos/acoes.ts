'use server';

import { decidirPedidoDeEdicao } from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../auth';
import { criarDecisoesDePedido } from './decisoes';

const decisoes = criarDecisoesDePedido({
  curador: curadorDaSessao,
  aprovar: (pedidoId, curadorId, depoisVisto) =>
    servidor().db.transaction((tx) =>
      decidirPedidoDeEdicao(tx, { pedidoId, curadorId, decisao: 'aprovado', depoisVisto }),
    ),
  recusar: (pedidoId, curadorId, motivo) =>
    servidor().db.transaction((tx) =>
      decidirPedidoDeEdicao(tx, { pedidoId, curadorId, decisao: 'recusado', motivo }),
    ),
});

const texto = (formulario: FormData, campo: string) => {
  const valor = formulario.get(campo);
  return typeof valor === 'string' ? valor : '';
};

export async function aprovarPedido(formulario: FormData) {
  redirect(
    await decisoes.aprovar(
      texto(formulario, 'pedidoId'),
      texto(formulario, 'depoisVisto'),
      texto(formulario, 'voltar'),
    ),
  );
}

export async function recusarPedido(formulario: FormData) {
  redirect(
    await decisoes.recusar(
      texto(formulario, 'pedidoId'),
      texto(formulario, 'motivo'),
      texto(formulario, 'voltar'),
    ),
  );
}
