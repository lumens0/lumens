import type { CuradorListado } from '@lumens/dominio';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Curadores } from './curadores';

const pessoa = (id: string, nome: string, ativo: boolean): CuradorListado => ({
  id,
  nome,
  email: `${nome.toLowerCase()}@ufal.br`,
  papel: 'curador',
  ativo,
  criadoEm: new Date('2026-11-09T12:00:00.000Z'),
});

const acao = () => Promise.resolve();
const tela = (curadores: CuradorListado[], mostrarDesativados?: boolean) =>
  renderToStaticMarkup(
    <Curadores
      curadores={curadores}
      eu="a-1"
      {...(mostrarDesativados === undefined ? {} : { mostrarDesativados })}
      adicionar={acao}
      desativar={acao}
      reativar={acao}
    />,
  );

describe('lista de curadores (SCRUM-350)', () => {
  const todos = [
    pessoa('a-1', 'Ana', true),
    pessoa('b-2', 'Bia', true),
    pessoa('c-3', 'Caio', false),
  ];

  it('esconde os desativados por padrão e oferece mostrá-los, com a contagem', () => {
    const html = tela(todos);

    expect(html).toContain('Ana');
    expect(html).toContain('Bia');
    expect(html).not.toContain('Caio');
    expect(html).toContain('href="/curadores?desativados=1"');
    expect(html).toContain('Mostrar desativados (1)');
  });

  it('com o filtro ligado mostra os desativados, com o botão de reativar, e oferece esconder', () => {
    const html = tela(todos, true);

    expect(html).toContain('Caio');
    expect(html).toContain('Reativar');
    expect(html).toContain('Esconder desativados');
  });

  it('sem desativados não mostra o filtro', () => {
    expect(tela(todos.slice(0, 2))).not.toContain('desativados');
  });

  it('quem está vendo não tem botão para desativar a si mesmo', () => {
    const html = tela([pessoa('a-1', 'Ana', true)]);
    expect(html).not.toContain('>Desativar<');
  });
});
