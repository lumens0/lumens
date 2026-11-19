'use server';

import { aprovarRelato, recusarRelato } from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../auth';
import { conferenciaMarcada } from '../pautas/[id]/decisoes';
import { criarModeracoes } from './moderacoes';

const moderacoes = criarModeracoes({
  curador: curadorDaSessao,
  aprovar: (relatoId, curadorId, fotosVistas) =>
    servidor().db.transaction((tx) => aprovarRelato(tx, { relatoId, curadorId, fotosVistas })),
  recusar: (relatoId, curadorId) =>
    servidor().db.transaction((tx) => recusarRelato(tx, { relatoId, curadorId })),
});

const texto = (formulario: FormData, campo: string) => {
  const valor = formulario.get(campo);
  return typeof valor === 'string' ? valor : '';
};

export async function aprovar(formulario: FormData) {
  redirect(
    await moderacoes.aprovar(
      texto(formulario, 'relatoId'),
      formulario.getAll('fotoVista').filter((v): v is string => typeof v === 'string' && v !== ''),
      conferenciaMarcada(formulario),
    ),
  );
}

export async function recusar(formulario: FormData) {
  redirect(await moderacoes.recusar(texto(formulario, 'relatoId')));
}
