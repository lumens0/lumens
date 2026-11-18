'use server';

import { adicionarCurador, desativarCurador, reativarCurador } from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { chavesDeCurador, curadorDaSessao, servidor } from '../../auth';
import { criarGestao } from './gestao';

const gestao = criarGestao({
  curador: curadorDaSessao,
  adicionar: (autorId, email, nome) =>
    adicionarCurador(servidor().db, chavesDeCurador(), { autorId, email, nome }),
  desativar: (autorId, alvoId) => desativarCurador(servidor().db, { autorId, alvoId }),
  reativar: (autorId, alvoId) => reativarCurador(servidor().db, { autorId, alvoId }),
});

const texto = (formulario: FormData, campo: string) => {
  const valor = formulario.get(campo);
  return typeof valor === 'string' ? valor : '';
};

export async function adicionar(formulario: FormData) {
  redirect(await gestao.adicionar(texto(formulario, 'email'), texto(formulario, 'nome')));
}

export async function desativar(formulario: FormData) {
  redirect(await gestao.desativar(texto(formulario, 'curadorId')));
}

export async function reativar(formulario: FormData) {
  redirect(await gestao.reativar(texto(formulario, 'curadorId')));
}
