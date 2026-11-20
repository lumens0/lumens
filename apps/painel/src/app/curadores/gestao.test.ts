import type { ResultadoCurador } from '@lumens/dominio';
import { describe, expect, it, vi } from 'vitest';
import { criarGestao } from './gestao';

const ID = '5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const ok: ResultadoCurador = { feito: true, curadorId: ID };

type Quem = { id: string; papel: 'curador' | 'administrador' } | undefined;

function montar(quem: Quem, resultado: ResultadoCurador = ok) {
  const adicionar = vi.fn().mockResolvedValue(resultado);
  const desativar = vi.fn().mockResolvedValue(resultado);
  const reativar = vi.fn().mockResolvedValue(resultado);
  const gestao = criarGestao({
    curador: () => Promise.resolve(quem),
    adicionar,
    desativar,
    reativar,
  });
  return { gestao, adicionar, desativar, reativar };
}

describe('gestão de curadores pela tela', () => {
  it('sem curador ativo na sessão vai para o login e não grava nada', async () => {
    const { gestao, adicionar, desativar, reativar } = montar(undefined);

    expect(await gestao.adicionar('a@ufal.br', 'Ana')).toBe('/login');
    expect(await gestao.desativar(ID)).toBe('/login');
    expect(await gestao.reativar(ID)).toBe('/login');
    expect(adicionar).not.toHaveBeenCalled();
    expect(desativar).not.toHaveBeenCalled();
    expect(reativar).not.toHaveBeenCalled();
  });

  it('curador comum chamando a action direto volta ao início e não grava nada', async () => {
    const { gestao, adicionar, desativar, reativar } = montar({ id: 'c-1', papel: 'curador' });

    expect(await gestao.adicionar('a@ufal.br', 'Ana')).toBe('/');
    expect(await gestao.desativar(ID)).toBe('/');
    expect(await gestao.reativar(ID)).toBe('/');
    expect(adicionar).not.toHaveBeenCalled();
    expect(desativar).not.toHaveBeenCalled();
    expect(reativar).not.toHaveBeenCalled();
  });

  it('administrador grava com o próprio id como autor e volta para a lista com o aviso', async () => {
    const { gestao, adicionar, desativar, reativar } = montar({
      id: 'adm-1',
      papel: 'administrador',
    });

    expect(await gestao.adicionar('a@ufal.br', 'Ana')).toBe('/curadores?feito=adicionado');
    expect(adicionar).toHaveBeenCalledWith('adm-1', 'a@ufal.br', 'Ana', 'curador');
    expect(await gestao.desativar(ID)).toBe('/curadores?feito=desativado');
    expect(desativar).toHaveBeenCalledWith('adm-1', ID);
    expect(await gestao.reativar(ID)).toBe('/curadores?feito=reativado');
    expect(reativar).toHaveBeenCalledWith('adm-1', ID);
  });

  it('o papel escolhido no formulário chega ao domínio, e valor desconhecido vira curador', async () => {
    const { gestao, adicionar } = montar({ id: 'adm-1', papel: 'administrador' });

    await gestao.adicionar('a@ufal.br', 'Ana', 'administrador');
    await gestao.adicionar('b@ufal.br', 'Bia', 'dono');

    expect(adicionar).toHaveBeenNthCalledWith(1, 'adm-1', 'a@ufal.br', 'Ana', 'administrador');
    expect(adicionar).toHaveBeenNthCalledWith(2, 'adm-1', 'b@ufal.br', 'Bia', 'curador');
  });

  it('recusa do domínio volta para a lista com o motivo', async () => {
    const { gestao } = montar(
      { id: 'adm-1', papel: 'administrador' },
      { feito: false, motivo: 'ultimo_administrador' },
    );

    expect(await gestao.desativar(ID)).toBe('/curadores?erro=ultimo_administrador');
  });

  it('id que não é UUID volta para a lista sem consultar o banco', async () => {
    const { gestao, desativar } = montar({ id: 'adm-1', papel: 'administrador' });

    expect(await gestao.desativar('1; drop table curador')).toBe('/curadores');
    expect(desativar).not.toHaveBeenCalled();
  });
});
