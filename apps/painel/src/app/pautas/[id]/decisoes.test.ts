import type { ResultadoDecisao } from '@lumens/dominio';
import { describe, expect, it, vi } from 'vitest';
import { criarDecisoes, fotosVistasDoFormulario } from './decisoes';

const ID = '5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const ok: ResultadoDecisao = { decidida: true };

function montar(curador: { id: string } | undefined, resultado: ResultadoDecisao = ok) {
  const aprovar = vi.fn().mockResolvedValue(resultado);
  const recusar = vi.fn().mockResolvedValue(resultado);
  const decisoes = criarDecisoes({ curador: () => Promise.resolve(curador), aprovar, recusar });
  return { decisoes, aprovar, recusar };
}

describe('decisões da curadoria pela tela', () => {
  it('sem curador ativo na sessão vai para o login e não grava nada', async () => {
    const { decisoes, aprovar, recusar } = montar(undefined);

    expect(await decisoes.aprovar(ID, 'ensino', {}, false, '', true)).toBe('/login');
    expect(await decisoes.recusar(ID, 'Duplicada.')).toBe('/login');
    expect(aprovar).not.toHaveBeenCalled();
    expect(recusar).not.toHaveBeenCalled();
  });

  it('aprovar e recusar gravam com o id do curador da sessão e voltam para a própria pauta', async () => {
    const { decisoes, aprovar, recusar } = montar({ id: 'curador-1' });

    expect(await decisoes.aprovar(ID, 'ensino', {}, false, '', true)).toBe(
      `/pautas/${ID}?feito=aprovada`,
    );
    expect(aprovar).toHaveBeenCalledWith(ID, 'curador-1', 'ensino', {}, false, '');

    expect(await decisoes.recusar(ID, 'Duplicada.')).toBe(`/pautas/${ID}?feito=recusada`);
    expect(recusar).toHaveBeenCalledWith(ID, 'curador-1', 'Duplicada.');
  });

  it('sem a confirmação de que conferiu, aprovar não grava e volta com o aviso', async () => {
    const { decisoes, aprovar } = montar({ id: 'curador-1' });

    expect(await decisoes.aprovar(ID, 'ensino', {})).toBe(
      `/pautas/${ID}?erro=conferencia_pendente`,
    );
    expect(aprovar).not.toHaveBeenCalled();
  });

  it('a confirmação não substitui a sessão: sem curador, vai para o login', async () => {
    expect(await montar(undefined).decisoes.aprovar(ID, 'ensino', {})).toBe('/login');
  });

  it('encaminha a seleção de urgência junto da aprovação', async () => {
    const { decisoes, aprovar } = montar({ id: 'curador-1' });
    expect(await decisoes.aprovar(ID, 'infraestrutura', {}, true, '', true)).toBe(
      `/pautas/${ID}?feito=aprovada`,
    );
    expect(aprovar).toHaveBeenCalledWith(ID, 'curador-1', 'infraestrutura', {}, true, '');
  });

  it.each(['motivo_obrigatorio', 'ja_decidida'] as const)(
    'recusa do domínio (%s) volta para a tela da pauta com o aviso',
    async (motivo) => {
      const { decisoes } = montar({ id: 'curador-1' }, { decidida: false, motivo });

      expect(await decisoes.recusar(ID, '')).toBe(`/pautas/${ID}?erro=${motivo}`);
    },
  );

  it('categoria inválida devolvida pelo domínio mantém a curadoria na pauta com aviso', async () => {
    const { decisoes } = montar(
      { id: 'curador-1' },
      { decidida: false, motivo: 'categoria_invalida' },
    );
    expect(await decisoes.aprovar(ID, '', {}, false, '', true)).toBe(
      `/pautas/${ID}?erro=categoria_invalida`,
    );
  });

  it('pauta inexistente ou id que não é UUID volta para a fila sem consultar o banco à toa', async () => {
    const { decisoes } = montar(
      { id: 'curador-1' },
      { decidida: false, motivo: 'pauta_inexistente' },
    );
    expect(await decisoes.aprovar(ID, 'ensino', {}, false, '', true)).toBe('/fila');

    const invalido = montar({ id: 'curador-1' });
    expect(
      await invalido.decisoes.aprovar('1; drop table pauta', 'ensino', {}, false, '', true),
    ).toBe('/fila');
    expect(invalido.aprovar).not.toHaveBeenCalled();
  });

  it('aprovar leva ao domínio a versão do texto que a tela mostrava; edição nova volta com o aviso', async () => {
    const { decisoes, aprovar } = montar(
      { id: 'curador-1' },
      { decidida: false, motivo: 'pauta_editada' },
    );
    expect(await decisoes.aprovar(ID, 'ensino', {}, false, 'versao-da-tela', true)).toBe(
      `/pautas/${ID}?erro=pauta_editada`,
    );
    expect(aprovar).toHaveBeenCalledWith(ID, 'curador-1', 'ensino', {}, false, 'versao-da-tela');
  });

  it('aprovar leva a foto vista ao domínio; foto mudada volta para a pauta com o aviso', async () => {
    const { decisoes, aprovar } = montar(
      { id: 'curador-1' },
      { decidida: false, motivo: 'relato_mudou' },
    );
    const fotos = { 'relato-1': ['foto-1', 'foto-2'], 'relato-2': [] };
    expect(await decisoes.aprovar(ID, 'ensino', fotos, false, '', true)).toBe(
      `/pautas/${ID}?erro=relato_mudou`,
    );
    expect(aprovar).toHaveBeenCalledWith(ID, 'curador-1', 'ensino', fotos, false, '');
  });

  it('lê do formulário as fotos de cada relato que a tela mostrou; relato visto sem foto fica vazio', () => {
    const formulario = new FormData();
    formulario.set('pautaId', ID);
    formulario.append('relatoVisto', 'relato-1');
    formulario.append('fotoVista:relato-1', 'foto-1');
    formulario.append('fotoVista:relato-1', 'foto-2');
    formulario.append('relatoVisto', 'relato-2');
    expect(fotosVistasDoFormulario(formulario)).toEqual({
      'relato-1': ['foto-1', 'foto-2'],
      'relato-2': [],
    });
  });

  it('relato que a tela não mostrou não entra, mesmo com campo de foto solto', () => {
    const formulario = new FormData();
    formulario.append('fotoVista:relato-3', 'foto-9');
    // Sem `relatoVisto`, o relato aparece só com a foto; o domínio confere o conjunto inteiro.
    expect(fotosVistasDoFormulario(formulario)).toEqual({ 'relato-3': ['foto-9'] });
    expect(fotosVistasDoFormulario(new FormData())).toEqual({});
  });
});
