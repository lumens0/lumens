import type { ResultadoDaConquista } from '@lumens/dominio';
import { describe, expect, it, vi } from 'vitest';
import { criarSalvarConquista } from './conquista';
import type { FotoPreparada } from './conquista-foto';

const ID = '5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const VOLTAR = (resultado: string) => `/pautas/${ID}?${resultado}#conquista-pauta`;
const FOTO_OK: FotoPreparada = { ok: true, bytes: Buffer.from('jpeg'), contentType: 'image/jpeg' };

function montar({
  curador = { id: 'curador-1' },
  foto = FOTO_OK,
  resultado = { salva: true, fotoSubstituida: null },
  storageFalha = false,
}: {
  curador?: { id: string } | null;
  foto?: FotoPreparada;
  resultado?: ResultadoDaConquista;
  storageFalha?: boolean;
} = {}) {
  const preparar = vi.fn().mockResolvedValue(foto);
  const guardar = vi.fn(() =>
    storageFalha ? Promise.reject(new Error('s3 fora')) : Promise.resolve('fotos/2026/11/nova.jpg'),
  );
  const salvar = vi.fn().mockResolvedValue(resultado);
  const descartar = vi.fn().mockResolvedValue(undefined);
  const salvarConquista = criarSalvarConquista({
    curador: () => Promise.resolve(curador ?? undefined),
    preparar,
    guardar,
    salvar,
    descartar,
  });
  return { salvarConquista, preparar, guardar, salvar, descartar };
}

function formulario(texto: string, foto?: File, extras: Record<string, string> = {}) {
  const dados = new FormData();
  dados.set('oQueFoiFeito', texto);
  if (foto) dados.set('foto', foto);
  for (const [campo, valor] of Object.entries(extras)) dados.set(campo, valor);
  return dados;
}
const arquivo = () => new File([new Uint8Array([1, 2, 3])], 'foto.jpg', { type: 'image/jpeg' });

describe('salvar o card de conquista pela tela', () => {
  it('sem curador ativo vai para o login e não faz nada', async () => {
    const m = montar({ curador: null });
    expect(await m.salvarConquista(ID, formulario('Feito.', arquivo()))).toBe('/login');
    expect(m.preparar).not.toHaveBeenCalled();
    expect(m.guardar).not.toHaveBeenCalled();
    expect(m.salvar).not.toHaveBeenCalled();
  });

  it('id que não é UUID volta para a fila', async () => {
    const m = montar();
    expect(await m.salvarConquista('x', formulario('Feito.'))).toBe('/fila');
    expect(m.salvar).not.toHaveBeenCalled();
  });

  it('só texto: grava com o curador da sessão, sem tocar no storage', async () => {
    const m = montar();
    expect(await m.salvarConquista(ID, formulario('Trocaram as lâmpadas.'))).toBe(
      VOLTAR('feito=conquista'),
    );
    expect(m.guardar).not.toHaveBeenCalled();
    expect(m.salvar).toHaveBeenCalledWith({
      pautaId: ID,
      curadorId: 'curador-1',
      texto: 'Trocaram as lâmpadas.',
      removerFoto: false,
    });
  });

  it('com foto: tira os metadados, guarda e grava a chave nova', async () => {
    const m = montar();
    expect(await m.salvarConquista(ID, formulario('Feito.', arquivo()))).toBe(
      VOLTAR('feito=conquista'),
    );
    expect(m.preparar).toHaveBeenCalledOnce();
    expect(m.guardar).toHaveBeenCalledWith(FOTO_OK.bytes, 'image/jpeg');
    expect(m.salvar).toHaveBeenCalledWith(
      expect.objectContaining({ fotoChave: 'fotos/2026/11/nova.jpg' }),
    );
  });

  it('"tirar a foto" chega ao domínio', async () => {
    const m = montar();
    await m.salvarConquista(ID, formulario('Feito.', undefined, { tirarFoto: 'on' }));
    expect(m.salvar).toHaveBeenCalledWith(expect.objectContaining({ removerFoto: true }));
  });

  it('texto com e-mail ou telefone, ou grande demais, volta com o erro e nem guarda a foto', async () => {
    const m = montar();
    expect(await m.salvarConquista(ID, formulario('Falem com ana@ufal.br', arquivo()))).toBe(
      VOLTAR('erro=texto_com_dado_pessoal'),
    );
    expect(await m.salvarConquista(ID, formulario('a'.repeat(161), arquivo()))).toBe(
      VOLTAR('erro=texto_longo'),
    );
    expect(m.preparar).not.toHaveBeenCalled();
    expect(m.guardar).not.toHaveBeenCalled();
    expect(m.salvar).not.toHaveBeenCalled();
  });

  it('foto recusada pelo sharp volta com o motivo e nada é guardado nem gravado', async () => {
    const m = montar({ foto: { ok: false, motivo: 'tamanho' } });
    expect(await m.salvarConquista(ID, formulario('Feito.', arquivo()))).toBe(
      VOLTAR('erro=foto_tamanho'),
    );
    expect(m.guardar).not.toHaveBeenCalled();
    expect(m.salvar).not.toHaveBeenCalled();
  });

  it('storage fora do ar volta com o aviso e não grava a linha', async () => {
    const m = montar({ storageFalha: true });
    expect(await m.salvarConquista(ID, formulario('Feito.', arquivo()))).toBe(
      VOLTAR('erro=foto_armazenamento'),
    );
    expect(m.salvar).not.toHaveBeenCalled();
  });

  it('domínio recusa (pauta não conquistada): a foto já guardada vai para a fila de remoção', async () => {
    const m = montar({ resultado: { salva: false, motivo: 'pauta_nao_conquistada' } });
    expect(await m.salvarConquista(ID, formulario('Feito.', arquivo()))).toBe(
      VOLTAR('erro=pauta_nao_conquistada'),
    );
    expect(m.descartar).toHaveBeenCalledWith('fotos/2026/11/nova.jpg');
  });

  it('erro inesperado na transação também descarta a foto e sobe o erro', async () => {
    const m = montar();
    m.salvar.mockRejectedValue(new Error('banco caiu'));
    await expect(m.salvarConquista(ID, formulario('Feito.', arquivo()))).rejects.toThrow(
      'banco caiu',
    );
    expect(m.descartar).toHaveBeenCalledWith('fotos/2026/11/nova.jpg');
  });
});
