'use server';

import {
  aprovarPauta,
  definirCategoria as gravarCategoria,
  recusarPauta,
  recusarRelatoDeOrigem as recusarRelatoNoDominio,
} from '@lumens/dominio';
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

/** Recusa só o relato de quem criou a pauta, que tem dado pessoal; a pauta segue em curadoria. */
export async function recusarRelatoDeOrigem(formulario: FormData) {
  const pautaId = texto(formulario, 'pautaId');
  const quem = await curadorDaSessao();
  if (!quem) redirect('/login');
  if (!UUID.test(pautaId)) redirect('/fila');
  const resultado = await servidor().db.transaction((tx) =>
    recusarRelatoNoDominio(tx, { pautaId, curadorId: quem.id }),
  );
  redirect(
    resultado.feito
      ? `/pautas/${pautaId}?feito=relato_recusado`
      : `/pautas/${pautaId}?erro=${resultado.motivo}`,
  );
}

export async function definirCategoria(formulario: FormData) {
  const pautaId = texto(formulario, 'pautaId');
  const quem = await curadorDaSessao();
  if (!quem) redirect('/login');
  if (!UUID.test(pautaId)) redirect('/fila');
  const resultado = await servidor().db.transaction((tx) =>
    gravarCategoria(tx, { pautaId, categoria: texto(formulario, 'categoria') }),
  );
  if (resultado.feito) redirect(`/pautas/${pautaId}?feito=categoria`);
  redirect(
    resultado.motivo === 'pauta_inexistente'
      ? '/fila'
      : `/pautas/${pautaId}?erro=${resultado.motivo}`,
  );
}
