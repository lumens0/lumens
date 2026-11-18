import type { ResultadoDecisaoDePedido } from '@lumens/dominio';
import { describe, expect, it, vi } from 'vitest';
import { criarDecisoesDePedido } from './decisoes';

const PEDIDO = '5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const PAUTA = '11111111-2222-4333-8444-555555555555';
const ok: ResultadoDecisaoDePedido = { decidido: true };

function montar(curador: { id: string } | undefined, resultado: ResultadoDecisaoDePedido = ok) {
  const aprovar = vi.fn().mockResolvedValue(resultado);
  const recusar = vi.fn().mockResolvedValue(resultado);
  const decisoes = criarDecisoesDePedido({
    curador: () => Promise.resolve(curador),
    aprovar,
    recusar,
  });
  return { decisoes, aprovar, recusar };
}

describe('decisão de pedido de edição pela tela', () => {
  it('sem curador ativo na sessão vai para o login e não grava nada', async () => {
    const { decisoes, aprovar, recusar } = montar(undefined);
    expect(await decisoes.aprovar(PEDIDO, 'texto', '/pedidos')).toBe('/login');
    expect(await decisoes.recusar(PEDIDO, 'motivo', '/pedidos')).toBe('/login');
    expect(aprovar).not.toHaveBeenCalled();
    expect(recusar).not.toHaveBeenCalled();
  });

  it('aprovar leva o texto que a tela mostrava e volta para a tela de origem', async () => {
    const { decisoes, aprovar } = montar({ id: 'curador-1' });

    expect(await decisoes.aprovar(PEDIDO, 'Texto novo', '/pedidos')).toBe(
      '/pedidos?feito=edicao_aprovada',
    );
    expect(aprovar).toHaveBeenCalledWith(PEDIDO, 'curador-1', 'Texto novo');
    expect(await decisoes.aprovar(PEDIDO, 'Texto novo', `/pautas/${PAUTA}`)).toBe(
      `/pautas/${PAUTA}?feito=edicao_aprovada`,
    );
  });

  it('recusar leva o motivo digitado', async () => {
    const { decisoes, recusar } = montar({ id: 'curador-1' });
    expect(await decisoes.recusar(PEDIDO, 'Muda o sentido.', '/pedidos')).toBe(
      '/pedidos?feito=edicao_recusada',
    );
    expect(recusar).toHaveBeenCalledWith(PEDIDO, 'curador-1', 'Muda o sentido.');
  });

  it.each(['motivo_invalido', 'ja_decidido', 'pedido_mudou', 'pedido_inexistente'] as const)(
    'recusa do domínio (%s) volta à tela com o erro',
    async (motivo) => {
      const { decisoes } = montar({ id: 'curador-1' }, { decidido: false, motivo });
      expect(await decisoes.aprovar(PEDIDO, 'x', '/pedidos')).toBe(
        `/pedidos?erro=edicao_${motivo}`,
      );
    },
  );

  it('id que não é UUID não consulta o banco, e destino de fora cai em /pedidos', async () => {
    const { decisoes, aprovar } = montar({ id: 'curador-1' });
    expect(await decisoes.aprovar('1; drop table', 'x', '/pedidos')).toBe('/pedidos');
    expect(aprovar).not.toHaveBeenCalled();
    expect(await decisoes.aprovar(PEDIDO, 'x', 'https://exemplo.com')).toBe(
      '/pedidos?feito=edicao_aprovada',
    );
  });
});
