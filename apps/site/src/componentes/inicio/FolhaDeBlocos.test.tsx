import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import exemplo from '../../dados/blocos-teste.json';
import { blocosDaFolha } from '../../dados/folha';
import { FolhaDeBlocos } from './FolhaDeBlocos';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const siglas = Object.fromEntries(exemplo.blocos.map((b) => [b.slug, b.slug.toUpperCase()]));
const pautas = [
  {
    slug: 'p1',
    titulo: 'P1',
    status: 'cobrando',
    apoios: 3,
    urgente: false,
    bloco_slug: 'bloco-a',
  },
  {
    slug: 'p2',
    titulo: 'P2',
    status: 'prometido',
    apoios: 9,
    urgente: true,
    bloco_slug: 'bloco-b',
  },
] as const;

const render = (bloco: string[] = []) =>
  renderToStaticMarkup(
    <FolhaDeBlocos
      base="/"
      blocos={blocosDaFolha(exemplo.blocos, siglas, pautas, [])}
      catalogo={exemplo.blocos}
      siglas={siglas}
      pautas={[...pautas]}
      atual={{ status: [], bloco }}
    />,
  );

describe('folha "Escolher blocos"', () => {
  it('é um diálogo modal com título, e o botão de abrir conta os blocos do campus', () => {
    const html = render();
    expect(html).toContain(`Escolher entre os ${String(exemplo.blocos.length)} blocos`);
    expect(html).toContain('aria-labelledby="folha-titulo"');
    expect(html).toContain('<h2 id="folha-titulo">Escolher blocos</h2>');
  });

  it('sem bloco escolhido, o botão final fica bloqueado e o resumo pede a escolha', () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Escolha um bloco para continuar<\/button>/);
    expect(html).toContain('Escolha ao menos um bloco para filtrar.');
  });

  it('com blocos já escolhidos, o botão libera e diz quantos vai filtrar', () => {
    const html = render(['bloco-a', 'bloco-b']);
    expect(html).toContain('Filtrar por 2 blocos</button>');
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('2 blocos escolhidos · 2 pautas');
  });

  it('lista todos os blocos como chips alternáveis, com a contagem de pautas, os com pauta primeiro', () => {
    const html = render(['bloco-a']);
    for (const bloco of exemplo.blocos) expect(html).toContain(bloco.nome);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    const chips = [...html.matchAll(/aria-pressed="[a-z]+">([^<]*)<span[^>]*>(\d+)</g)];
    expect(chips).toHaveLength(exemplo.blocos.length);
    expect(chips.map((c) => Number(c[2]))).toEqual(
      [...chips.map((c) => Number(c[2]))].sort((a, b) => b - a),
    );
  });

  it('tem um campo de busca com rótulo', () => {
    expect(render()).toContain('type="search"');
    expect(render()).toContain('Buscar bloco por nome ou sigla');
  });
});
