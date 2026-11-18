import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Pagina from './page';

// A página publicada com a sessão do Auth.js trocada: sem sessão, curador comum ou administrador.
const sessao = vi.hoisted(() => ({
  atual: undefined as { id: string; nome: string; papel: 'curador' | 'administrador' } | undefined,
}));
vi.mock('../../auth', () => ({
  curadorDaSessao: () => Promise.resolve(sessao.atual),
  servidor: () => ({ db: {} }),
  chavesDeCurador: () => ({}),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@lumens/dominio', () => ({
  listarCuradores: () =>
    Promise.resolve([
      {
        id: '5f1c2d3e-4a5b-4c6d-8e7f-0123456789ab',
        nome: 'Bia',
        email: 'bia@ufal.br',
        papel: 'curador',
        ativo: true,
        criadoEm: new Date('2026-11-09T12:00:00.000Z'),
      },
    ]),
}));
vi.mock('next/navigation', () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect:${destino}`);
  },
  notFound: () => {
    throw new Error('notFound');
  },
}));

const parametros = Promise.resolve({});

beforeEach(() => {
  sessao.atual = undefined;
});

describe('página /curadores', () => {
  it('sem sessão manda para o login', async () => {
    await expect(Pagina({ searchParams: parametros })).rejects.toThrow('redirect:/login');
  });

  it('curador comum recebe 404, mesmo pela URL direta', async () => {
    sessao.atual = { id: 'c-1', nome: 'Caio', papel: 'curador' };

    await expect(Pagina({ searchParams: parametros })).rejects.toThrow('notFound');
  });

  it('administrador vê a lista com o e-mail e o link no cabeçalho', async () => {
    sessao.atual = { id: 'a-1', nome: 'Ana', papel: 'administrador' };

    const html = renderToStaticMarkup(await Pagina({ searchParams: parametros }));

    expect(html).toContain('Bia');
    expect(html).toContain('bia@ufal.br');
    expect(html).toContain('href="/curadores"');
  });
});
