'use server';

import { aprovarRelato, recusarRelato } from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../auth';
import { criarModeracoes } from './moderacoes';

const moderacoes = criarModeracoes({
  curador: curadorDaSessao,
  aprovar: (relatoId, curadorId) =>
    servidor().db.transaction((tx) => aprovarRelato(tx, { relatoId, curadorId })),
  recusar: (relatoId, curadorId) =>
    servidor().db.transaction((tx) => recusarRelato(tx, { relatoId, curadorId })),
});

const texto = (formulario: FormData, campo: string) => {
  const valor = formulario.get(campo);
  return typeof valor === 'string' ? valor : '';
};

export async function aprovar(formulario: FormData) {
  redirect(await moderacoes.aprovar(texto(formulario, 'relatoId')));
}

export async function recusar(formulario: FormData) {
  redirect(await moderacoes.recusar(texto(formulario, 'relatoId')));
}
