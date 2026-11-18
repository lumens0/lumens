'use server';

import { recusarFoto as recusarNoDominio } from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { curadorDaSessao, servidor } from '../../auth';
import { criarRecusaDeFoto } from './recusa-de-foto';

const recusa = criarRecusaDeFoto({
  curador: curadorDaSessao,
  recusar: (fotoId, curadorId, motivo) =>
    servidor().db.transaction((tx) => recusarNoDominio(tx, { fotoId, curadorId, motivo })),
});

const texto = (formulario: FormData, campo: string) => {
  const valor = formulario.get(campo);
  return typeof valor === 'string' ? valor : '';
};

/** Recusa uma foto, com motivo; o texto do relato e as outras fotos seguem. */
export async function recusarFoto(formulario: FormData) {
  redirect(
    await recusa(
      texto(formulario, 'fotoId'),
      texto(formulario, 'motivo'),
      texto(formulario, 'voltar'),
    ),
  );
}
