'use server';

import { fotosARemover } from '@lumens/db';
import { salvarConquistaDaCuradoria } from '@lumens/dominio';
import { redirect } from 'next/navigation';
import { guardarNoBucket } from '../../../armazenamento';
import { curadorDaSessao, servidor } from '../../../auth';
import { criarSalvarConquista } from './conquista';
import { chaveDaFotoDaConquista, prepararFotoDaConquista } from './conquista-foto';

const salvarPelaTela = criarSalvarConquista({
  curador: curadorDaSessao,
  preparar: prepararFotoDaConquista,
  async guardar(bytes, contentType) {
    const chave = chaveDaFotoDaConquista();
    await guardarNoBucket(chave, bytes, contentType);
    return chave;
  },
  salvar: ({ pautaId, curadorId, texto, fotoChave, removerFoto }) =>
    servidor().db.transaction((tx) =>
      salvarConquistaDaCuradoria(tx, { pautaId, curadorId, texto, fotoChave, removerFoto }),
    ),
  async descartar(chave) {
    await servidor()
      .db.insert(fotosARemover)
      .values({ chave })
      .onConflictDoNothing({ target: fotosARemover.chave });
  },
  avisar: (mensagem) => {
    console.error(mensagem);
  },
});

export async function salvarConquista(formulario: FormData) {
  const pautaId = formulario.get('pautaId');
  redirect(await salvarPelaTela(typeof pautaId === 'string' ? pautaId : '', formulario));
}
