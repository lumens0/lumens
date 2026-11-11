import type { ResultadoDecisao } from '@lumens/dominio';
import { describe, expect, it, vi } from 'vitest';
import { criarDecisoes } from './decisoes';

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

    expect(await decisoes.aprovar(ID)).toBe('/login');
    expect(await decisoes.recusar(ID, 'Duplicada.')).toBe('/login');
    expect(aprovar).not.toHaveBeenCalled();
    expect(recusar).not.toHaveBeenCalled();
  });

  it('aprovar e recusar gravam com o id do curador da sessão e voltam para a fila', async () => {
    const { decisoes, aprovar, recusar } = montar({ id: 'curador-1' });

    expect(await decisoes.aprovar(ID)).toBe('/fila?feito=aprovada');
    expect(aprovar).toHaveBeenCalledWith(ID, 'curador-1');

    expect(await decisoes.recusar(ID, 'Duplicada.')).toBe('/fila?feito=recusada');
    expect(recusar).toHaveBeenCalledWith(ID, 'curador-1', 'Duplicada.');
  });

  it.each(['motivo_obrigatorio', 'ja_decidida'] as const)(
    'recusa do domínio (%s) volta para a tela da pauta com o aviso',
    async (motivo) => {
      const { decisoes } = montar({ id: 'curador-1' }, { decidida: false, motivo });

      expect(await decisoes.recusar(ID, '')).toBe(`/pautas/${ID}?erro=${motivo}`);
    },
  );

  it('pauta inexistente ou id que não é UUID volta para a fila sem consultar o banco à toa', async () => {
    const { decisoes } = montar(
      { id: 'curador-1' },
      { decidida: false, motivo: 'pauta_inexistente' },
    );
    expect(await decisoes.aprovar(ID)).toBe('/fila');

    const invalido = montar({ id: 'curador-1' });
    expect(await invalido.decisoes.aprovar('1; drop table pauta')).toBe('/fila');
    expect(invalido.aprovar).not.toHaveBeenCalled();
  });
});
