'use server';

import { aprovarPauta, definirCategoria as gravarCategoria, recusarPauta } from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../../auth';
import { criarDecisoes, UUID } from './decisoes';

const decisoes = criarDecisoes({
  curador: curadorDaSessao,
  aprovar: (pautaId, curadorId, categoria) =>
    servidor().db.transaction((tx) => aprovarPauta(tx, { pautaId, curadorId, categoria })),
  recusar: (pautaId, curadorId, motivo) =>
    servidor().db.transaction((tx) => recusarPauta(tx, { pautaId, curadorId, motivo })),
});

const texto = (formulario: FormData, campo: string) => {
  const valor = formulario.get(campo);
  return typeof valor === 'string' ? valor : '';
};

export async function aprovar(formulario: FormData) {
  redirect(await decisoes.aprovar(texto(formulario, 'pautaId'), texto(formulario, 'categoria')));
}

export async function recusar(formulario: FormData) {
  redirect(await decisoes.recusar(texto(formulario, 'pautaId'), texto(formulario, 'motivo')));
}

export async function definirCategoria(formulario: FormData) {
  const pautaId = texto(formulario, 'pautaId');
  const quem = await curadorDaSessao();
  if (!quem) redirect('/login');
  if (!UUID.test(pautaId)) redirect('/fila');
  const atualizada = await servidor().db.transaction((tx) =>
    gravarCategoria(tx, { pautaId, categoria: texto(formulario, 'categoria') }),
  );
  redirect(
    atualizada
      ? `/pautas/${pautaId}?feito=categoria`
      : `/pautas/${pautaId}?erro=categoria_invalida`,
  );
}
