import { ErroDeRegra } from '@lumens/dominio';
import { describe, expect, it, vi } from 'vitest';
import { criarRegistroDePromessa, hojeEmMaceio } from './registro';

const ID = '5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const campos = {
  resumo: ' A reitoria vai trocar o bebedouro. ',
  fonte: ' PROGINST, pelo Fala.BR ',
  dataEntrega: '2026-12-10',
};

function montar(curador: { id: string } | null = { id: 'curador-1' }) {
  const registrar = vi.fn().mockResolvedValue({ avisados: 42 });
  const registrarPelaTela = criarRegistroDePromessa({
    curador: () => Promise.resolve(curador ?? undefined),
    registrar,
    hoje: () => '2026-11-10',
  });
  return { registrarPelaTela, registrar };
}

describe('registrar promessa pela tela', () => {
  it('grava com o curador da sessão, sem espaços sobrando, e volta para a pauta', async () => {
    const { registrarPelaTela, registrar } = montar();

    expect(await registrarPelaTela(ID, campos)).toBe(`/pautas/${ID}?feito=promessa&avisados=42`);
    expect(registrar).toHaveBeenCalledWith(ID, 'curador-1', {
      resumo: 'A reitoria vai trocar o bebedouro.',
      fonte: 'PROGINST, pelo Fala.BR',
      dataEntrega: '2026-12-10',
    });
  });

  it('sem curador ativo na sessão vai para o login e não grava nada', async () => {
    const { registrarPelaTela, registrar } = montar(null);

    expect(await registrarPelaTela(ID, campos)).toBe('/login');
    expect(registrar).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...campos, resumo: '   ' }, 'campos_obrigatorios'],
    [{ ...campos, fonte: '' }, 'campos_obrigatorios'],
    [{ ...campos, dataEntrega: '' }, 'campos_obrigatorios'],
    [{ ...campos, dataEntrega: '2026-11-09' }, 'data_no_passado'],
  ])('formulário incompleto ou com data passada não chega ao domínio (%#)', async (ruins, erro) => {
    const { registrarPelaTela, registrar } = montar();

    expect(await registrarPelaTela(ID, ruins)).toBe(`/pautas/${ID}/promessa?erro=${erro}`);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('promessa para hoje é aceita', async () => {
    const { registrarPelaTela } = montar();

    expect(await registrarPelaTela(ID, { ...campos, dataEntrega: '2026-11-10' })).toContain(
      'feito=promessa',
    );
  });

  it('recusa de regra do domínio volta ao formulário; erro inesperado sobe', async () => {
    const { registrarPelaTela, registrar } = montar();

    registrar.mockRejectedValueOnce(new ErroDeRegra('transicao_invalida', 'não pode'));
    expect(await registrarPelaTela(ID, campos)).toBe(
      `/pautas/${ID}/promessa?erro=transicao_invalida`,
    );

    registrar.mockRejectedValueOnce(new Error('banco caiu'));
    await expect(registrarPelaTela(ID, campos)).rejects.toThrow('banco caiu');
  });

  it('id que não é UUID volta para a lista sem gravar', async () => {
    const { registrarPelaTela, registrar } = montar();

    expect(await registrarPelaTela('1; drop table promessa', campos)).toBe('/pautas');
    expect(registrar).not.toHaveBeenCalled();
  });
});

describe('hojeEmMaceio', () => {
  it('vira o dia às 03:00 UTC, que é meia-noite em Maceió', () => {
    expect(hojeEmMaceio(new Date('2026-11-10T02:59:00.000Z'))).toBe('2026-11-09');
    expect(hojeEmMaceio(new Date('2026-11-10T03:00:00.000Z'))).toBe('2026-11-10');
  });
});
