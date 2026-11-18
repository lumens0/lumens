import type { ResultadoRecusaDeFoto } from '@lumens/dominio';
import { describe, expect, it, vi } from 'vitest';
import { destinoDeVolta } from '../destino';
import { criarRecusaDeFoto } from './recusa-de-foto';

const FOTO = '5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const PAUTA = '11111111-2222-4333-8444-555555555555';

function montar(
  curador: { id: string } | undefined,
  resultado: ResultadoRecusaDeFoto = { recusada: true },
) {
  const recusar = vi.fn().mockResolvedValue(resultado);
  const recusa = criarRecusaDeFoto({ curador: () => Promise.resolve(curador), recusar });
  return { recusa, recusar };
}

describe('recusar foto pela tela', () => {
  it('sem curador ativo na sessão vai para o login e não grava nada', async () => {
    const { recusa, recusar } = montar(undefined);
    expect(await recusa(FOTO, 'Mostra uma pessoa.', '/relatos')).toBe('/login');
    expect(recusar).not.toHaveBeenCalled();
  });

  it('grava com o curador da sessão e o motivo, e volta para a tela de onde veio', async () => {
    const { recusa, recusar } = montar({ id: 'curador-1' });

    expect(await recusa(FOTO, 'Mostra uma pessoa.', '/relatos')).toBe(
      '/relatos?feito=foto_recusada',
    );
    expect(recusar).toHaveBeenCalledWith(FOTO, 'curador-1', 'Mostra uma pessoa.');
    expect(await recusa(FOTO, 'x', `/pautas/${PAUTA}`)).toBe(
      `/pautas/${PAUTA}?feito=foto_recusada`,
    );
  });

  it.each(['motivo_invalido', 'ja_recusada', 'relato_recusado', 'foto_inexistente'] as const)(
    'recusa do domínio (%s) volta à tela com o erro',
    async (motivo) => {
      const { recusa } = montar({ id: 'curador-1' }, { recusada: false, motivo });
      expect(await recusa(FOTO, '', '/relatos')).toBe(`/relatos?erro=foto_${motivo}`);
    },
  );

  it('id que não é UUID não consulta o banco', async () => {
    const { recusa, recusar } = montar({ id: 'curador-1' });
    expect(await recusa('1; drop table relato_foto', 'x', '/relatos')).toBe('/relatos');
    expect(recusar).not.toHaveBeenCalled();
  });

  it('o destino só pode ser uma tela do painel: endereço de fora cai na fila de relatos', async () => {
    const { recusa } = montar({ id: 'curador-1' });
    for (const voltar of ['https://exemplo.com', '//exemplo.com', '/pautas/../login', '/outra']) {
      expect(await recusa(FOTO, 'x', voltar)).toBe('/relatos?feito=foto_recusada');
    }
    expect(destinoDeVolta('/pedidos', '/relatos')).toBe('/pedidos');
    expect(destinoDeVolta(`/pautas/${PAUTA}`, '/relatos')).toBe(`/pautas/${PAUTA}`);
    expect(destinoDeVolta('/pautas/nao-e-uuid', '/relatos')).toBe('/relatos');
  });
});
