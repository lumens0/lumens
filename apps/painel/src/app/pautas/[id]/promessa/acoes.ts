'use server';

import { registrarPromessa } from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../../../auth';
import { criarRegistroDePromessa, hojeEmMaceio } from './registro';

const registrarPelaTela = criarRegistroDePromessa({
  curador: curadorDaSessao,
  registrar: (pautaId, curadorId, campos) =>
    servidor().db.transaction((tx) =>
      registrarPromessa(tx, { pautaId, registradaPor: curadorId, ...campos }),
    ),
  hoje: hojeEmMaceio,
});

const texto = (formulario: FormData, campo: string) => {
  const valor = formulario.get(campo);
  return typeof valor === 'string' ? valor : '';
};

export async function registrar(formulario: FormData) {
  redirect(
    await registrarPelaTela(texto(formulario, 'pautaId'), {
      resumo: texto(formulario, 'resumo'),
      fonte: texto(formulario, 'fonte'),
      dataEntrega: texto(formulario, 'dataEntrega'),
    }),
  );
}
