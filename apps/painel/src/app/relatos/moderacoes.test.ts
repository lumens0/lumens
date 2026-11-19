import type { ResultadoModeracao } from '@lumens/dominio';
import { describe, expect, it, vi } from 'vitest';
import { criarModeracoes } from './moderacoes';

const ID = '5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const ok: ResultadoModeracao = { moderado: true };

function montar(curador: { id: string } | undefined, resultado: ResultadoModeracao = ok) {
  const aprovar = vi.fn().mockResolvedValue(resultado);
  const recusar = vi.fn().mockResolvedValue(resultado);
  const moderacoes = criarModeracoes({ curador: () => Promise.resolve(curador), aprovar, recusar });
  return { moderacoes, aprovar, recusar };
}

describe('moderação de relatos pela tela', () => {
  it('sem curador ativo na sessão vai para o login e não grava nada', async () => {
    const { moderacoes, aprovar, recusar } = montar(undefined);

    expect(await moderacoes.aprovar(ID, [], true)).toBe('/login');
    expect(await moderacoes.recusar(ID)).toBe('/login');
    expect(aprovar).not.toHaveBeenCalled();
    expect(recusar).not.toHaveBeenCalled();
  });

  it('sem a confirmação de que conferiu, aprovar não grava e volta com o aviso', async () => {
    const { moderacoes, aprovar } = montar({ id: 'curador-1' });

    expect(await moderacoes.aprovar(ID, [])).toBe('/relatos?erro=conferencia_pendente');
    expect(aprovar).not.toHaveBeenCalled();
  });

  it('aprovar e recusar gravam com o id do curador da sessão e voltam para a fila', async () => {
    const { moderacoes, aprovar, recusar } = montar({ id: 'curador-1' });

    expect(await moderacoes.aprovar(ID, ['foto-1', 'foto-2'], true)).toBe('/relatos?feito=aprovado');
    expect(aprovar).toHaveBeenCalledWith(ID, 'curador-1', ['foto-1', 'foto-2']);

    expect(await moderacoes.recusar(ID)).toBe('/relatos?feito=recusado');
    expect(recusar).toHaveBeenCalledWith(ID, 'curador-1');
  });

  it('relato cujas fotos mudaram depois da fila volta para a fila com o aviso', async () => {
    const { moderacoes } = montar({ id: 'curador-1' }, { moderado: false, motivo: 'relato_mudou' });

    expect(await moderacoes.aprovar(ID, [], true)).toBe('/relatos?erro=relato_mudou');
  });

  it('relato já moderado volta para a fila com o aviso', async () => {
    const { moderacoes } = montar({ id: 'curador-1' }, { moderado: false, motivo: 'ja_moderado' });

    expect(await moderacoes.aprovar(ID, [], true)).toBe('/relatos?erro=ja_moderado');
  });

  it('relato inexistente ou id que não é UUID volta para a fila sem consultar o banco à toa', async () => {
    const { moderacoes } = montar(
      { id: 'curador-1' },
      { moderado: false, motivo: 'relato_inexistente' },
    );
    expect(await moderacoes.recusar(ID)).toBe('/relatos');

    const invalido = montar({ id: 'curador-1' });
    expect(await invalido.moderacoes.aprovar('1; drop table relato', [], true)).toBe('/relatos');
    expect(invalido.aprovar).not.toHaveBeenCalled();
  });
});
