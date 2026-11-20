// @vitest-environment jsdom
import type { FluxoEmCards } from '@lumens/marca/fluxo';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MostrarDesativados } from './curadores/mostrar-desativados';
import { FluxosDoManual } from './manual/fluxos-do-manual';
import { FormularioDaConquista } from './pautas/[id]/conquista-formulario';
import { MotivoDaRecusa } from './pautas/[id]/motivo-da-recusa';
import { BuscaDaLista } from './pautas/busca';

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('BuscaDaLista (no navegador)', () => {
  const desenhar = (q = '', situacoes: string[] = [], pendencias: string[] = []) =>
    render(<BuscaDaLista q={q} situacoes={situacoes} pendencias={pendencias} />);
  const campo = () => screen.getByRole<HTMLInputElement>('searchbox');

  it('digitar espera uma pausa e então troca a URL, uma vez só, mantendo os filtros', () => {
    vi.useFakeTimers();
    desenhar('', ['cobrando'], ['sem_resposta']);
    fireEvent.change(campo(), { target: { value: 'sa' } });
    fireEvent.change(campo(), { target: { value: 'sala' } });
    expect(replace).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/pautas?status=cobrando&pendencia=sem_resposta&q=sala', {
      scroll: false,
    });
  });

  it('voltar ao texto que já está na URL não busca de novo', () => {
    vi.useFakeTimers();
    desenhar('sala');
    fireEvent.change(campo(), { target: { value: 'sala ' } });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it('a busca que chega de fora (por exemplo, "Limpar filtros") limpa o campo', () => {
    const { rerender } = desenhar('sala');
    expect(campo().value).toBe('sala');
    rerender(<BuscaDaLista q="" situacoes={[]} pendencias={[]} />);
    expect(campo().value).toBe('');
  });

  it('a busca que a pessoa digitou e já enviou não reescreve o campo no meio da digitação', () => {
    vi.useFakeTimers();
    const { rerender } = desenhar('');
    fireEvent.change(campo(), { target: { value: 'sal' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    // O servidor responde com a busca enviada, enquanto a pessoa já digitou mais uma letra.
    fireEvent.change(campo(), { target: { value: 'sala' } });
    rerender(<BuscaDaLista q="sal" situacoes={[]} pendencias={[]} />);
    expect(campo().value).toBe('sala');
  });

  it('limpar o campo pede a lista sem busca', () => {
    vi.useFakeTimers();
    desenhar('sala', ['cobrando']);
    fireEvent.change(campo(), { target: { value: '' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(replace).toHaveBeenCalledWith('/pautas?status=cobrando', { scroll: false });
  });
});

describe('MotivoDaRecusa (no navegador)', () => {
  it('o contador acompanha o que se digita', async () => {
    const usuario = userEvent.setup();
    render(<MotivoDaRecusa maximo={300} />);
    expect(screen.getByText('0/300')).toBeTruthy();
    await usuario.type(screen.getByRole('textbox'), 'Falta o bloco.');
    expect(screen.getByText('14/300')).toBeTruthy();
  });
});

describe('MostrarDesativados (no navegador)', () => {
  it('marcar pede a lista com desativados; desmarcar, a lista sem eles', async () => {
    const usuario = userEvent.setup();
    const { rerender } = render(<MostrarDesativados marcado={false} total={2} />);
    await usuario.click(screen.getByRole('checkbox'));
    expect(push).toHaveBeenLastCalledWith('/curadores?desativados=1');
    rerender(<MostrarDesativados marcado total={2} />);
    await usuario.click(screen.getByRole('checkbox'));
    expect(push).toHaveBeenLastCalledWith('/curadores');
  });
});

describe('FormularioDaConquista (no navegador)', () => {
  const salvar = () => Promise.resolve();
  const desenhar = (extra: Partial<Parameters<typeof FormularioDaConquista>[0]> = {}) =>
    render(
      <FormularioDaConquista
        pautaId="p1"
        textoSalvo=""
        fotoAtual={null}
        urlDoCard={null}
        salvar={salvar}
        {...extra}
      />,
    );

  const revogar = vi.fn();
  beforeEach(() => {
    let contador = 0;
    revogar.mockClear();
    URL.createObjectURL = vi.fn(() => (contador++ === 0 ? 'blob:previa' : 'blob:outra'));
    URL.revokeObjectURL = revogar;
  });

  it('o contador conta o que se digita e passa de 160 bloqueia o Salvar', async () => {
    const usuario = userEvent.setup();
    desenhar();
    const caixa = screen.getByRole('textbox');
    await usuario.type(caixa, 'Trocamos as lâmpadas.');
    expect(screen.getByText('21/160')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Salvar' }).disabled).toBe(false);
    fireEvent.change(caixa, { target: { value: 'a'.repeat(163) } });
    expect(screen.getByText(/163\/160: tire 3 para salvar\./)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Salvar' }).disabled).toBe(true);
  });

  it('escolher uma foto mostra a prévia e some com "Tirar esta foto"', async () => {
    const usuario = userEvent.setup();
    desenhar({ fotoAtual: '/curadoria/arquivos/a.jpg' });
    expect(screen.getByText('Tirar esta foto')).toBeTruthy();
    const arquivo = new File(['x'], 'foto.png', { type: 'image/png' });
    await usuario.upload(screen.getByLabelText('Foto do que foi feito'), arquivo);
    expect(screen.getByAltText('Prévia da foto escolhida').getAttribute('src')).toBe('blob:previa');
    expect(screen.queryByText('Tirar esta foto')).toBeNull();
  });

  it('trocar a foto libera a prévia anterior', async () => {
    const usuario = userEvent.setup();
    desenhar();
    const entrada = screen.getByLabelText('Foto do que foi feito');
    await usuario.upload(entrada, new File(['1'], 'a.png', { type: 'image/png' }));
    await usuario.upload(entrada, new File(['2'], 'b.png', { type: 'image/png' }));
    expect(revogar).toHaveBeenCalledWith('blob:previa');
  });
});

describe('FluxosDoManual (no navegador)', () => {
  const fluxos: FluxoEmCards[] = [
    {
      id: 'curar',
      rotulo: 'Curar uma pauta',
      chamada: 'Para quem decide.',
      passos: [{ titulo: 'Abrir a pauta', resumo: 'Leia o relato.', onde: 'painel' }],
    },
    {
      id: 'apoiar',
      rotulo: 'Apoiar uma pauta',
      chamada: 'Para quem apoia.',
      passos: [{ titulo: 'Mandar o comando', resumo: 'Pelo WhatsApp.', onde: 'bot' }],
    },
  ];

  it('tocar num chip troca a chamada e os passos', async () => {
    const usuario = userEvent.setup();
    render(<FluxosDoManual fluxos={fluxos} />);
    expect(screen.getByText('Para quem decide.')).toBeTruthy();
    await usuario.click(screen.getByRole('button', { name: 'Apoiar uma pauta' }));
    expect(screen.getByText('Para quem apoia.')).toBeTruthy();
    expect(screen.getByText('Mandar o comando')).toBeTruthy();
    expect(screen.queryByText('Abrir a pauta')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Apoiar uma pauta' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Curar uma pauta' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });
});
