// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuscaDaLista } from './busca';
import { buscaVigente, registrarBusca } from './busca-enviada';
import { FiltroLink } from './filtro-link';

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  registrarBusca('');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('busca vigente', () => {
  it('sem diferença, vale a busca que a página mostra', () => {
    registrarBusca('sala');
    expect(buscaVigente('sala')).toBe('sala');
    expect(buscaVigente('sala ')).toBe('sala ');
  });

  it('com uma busca enviada que a página ainda não mostra, vale a enviada', () => {
    registrarBusca('sala');
    expect(buscaVigente('')).toBe('sala');
  });
});

describe('FiltroLink (no navegador)', () => {
  const filtros = { situacoes: ['cobrando'], pendencias: [], q: '' };
  const desenhar = (extra: Partial<Parameters<typeof FiltroLink>[0]> = {}) =>
    render(
      <FiltroLink filtros={filtros} className="chip" {...extra}>
        Cobrando
      </FiltroLink>,
    );

  it('é um link normal para quem está sem JavaScript, com a busca que a página mostra', () => {
    desenhar();
    expect(screen.getByRole('link', { name: 'Cobrando' }).getAttribute('href')).toBe(
      '/pautas?status=cobrando',
    );
  });

  it('marca o chip atual com aria-current', () => {
    desenhar({ atual: true });
    expect(screen.getByRole('link').getAttribute('aria-current')).toBe('true');
    cleanup();
    desenhar({ atual: false });
    expect(screen.getByRole('link').getAttribute('aria-current')).toBeNull();
  });

  it('sem busca pendente, o clique segue o link', () => {
    desenhar();
    const livre = fireEvent.click(screen.getByRole('link'));
    expect(livre).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it('com uma busca enviada que a página ainda não mostra, o clique leva a busca junto', () => {
    registrarBusca('sala');
    desenhar();
    const livre = fireEvent.click(screen.getByRole('link'));
    expect(livre).toBe(false);
    expect(push).toHaveBeenCalledWith('/pautas?status=cobrando&q=sala');
  });

  it('Ctrl, Cmd ou Shift deixam o navegador abrir o link como ele é', () => {
    registrarBusca('sala');
    desenhar();
    expect(fireEvent.click(screen.getByRole('link'), { ctrlKey: true })).toBe(true);
    expect(fireEvent.click(screen.getByRole('link'), { metaKey: true })).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('buscar → tocar numa etapa antes de o servidor responder (no navegador)', () => {
  it('o clique mantém a busca enviada, mesmo com a prop q ainda vazia', () => {
    vi.useFakeTimers();
    render(
      <>
        <BuscaDaLista q="" situacoes={[]} pendencias={[]} />
        <FiltroLink filtros={{ situacoes: ['cobrando'], pendencias: [], q: '' }}>
          Cobrando
        </FiltroLink>
      </>,
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sala' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(replace).toHaveBeenCalledWith('/pautas?q=sala', { scroll: false });
    fireEvent.click(screen.getByRole('link', { name: 'Cobrando' }));
    expect(push).toHaveBeenCalledWith('/pautas?status=cobrando&q=sala');
  });

  it('"Limpar filtros" (a busca chega vazia) deixa de levar a busca antiga', () => {
    registrarBusca('sala');
    const { rerender } = render(
      <>
        <BuscaDaLista q="sala" situacoes={[]} pendencias={[]} />
        <FiltroLink filtros={{ situacoes: ['cobrando'], pendencias: [], q: 'sala' }}>
          Cobrando
        </FiltroLink>
      </>,
    );
    rerender(
      <>
        <BuscaDaLista q="" situacoes={[]} pendencias={[]} />
        <FiltroLink filtros={{ situacoes: ['cobrando'], pendencias: [], q: '' }}>
          Cobrando
        </FiltroLink>
      </>,
    );
    expect(fireEvent.click(screen.getByRole('link', { name: 'Cobrando' }))).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it('ao entrar na tela, a busca da URL vale mais que a de uma visita anterior', () => {
    registrarBusca('antiga');
    render(<BuscaDaLista q="" situacoes={[]} pendencias={[]} />);
    expect(buscaVigente('')).toBe('');
  });
});
