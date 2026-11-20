// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompartilharCard } from './CompartilharCard';
import { FotosDoRelato } from './FotosDoRelato';

beforeEach(() => {
  // O jsdom não tem o <dialog> modal: estes são o que o navegador faria.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const dialogo = () => document.querySelector('dialog') as HTMLDialogElement;

describe('CompartilharCard (no navegador)', () => {
  const desenhar = () =>
    render(
      <CompartilharCard
        slug="bebedouros"
        titulo="Bebedouros"
        apoios="72"
        etapa="Juntando apoios"
        link="https://lumens.teste/p/bebedouros"
      />,
    );

  it('abre o diálogo, trava a rolagem e pede a imagem do servidor uma só vez', async () => {
    const buscar = vi.fn(() => Promise.resolve(new Response(new Blob(['x']), { status: 200 })));
    vi.stubGlobal('fetch', buscar);
    const usuario = userEvent.setup();
    desenhar();
    await usuario.click(screen.getByRole('button', { name: 'Compartilhar card' }));
    expect(dialogo().hasAttribute('open')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: /Compartilhar ou copiar o card/ })
          .disabled,
      ).toBe(false);
    });
    expect(buscar).toHaveBeenCalledWith('/p/bebedouros/card.png');
    // Fecha e abre de novo: a imagem já está carregada.
    await usuario.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(document.body.style.overflow).toBe('');
    await usuario.click(screen.getByRole('button', { name: 'Compartilhar card' }));
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it('enquanto carrega, o botão principal diz que está preparando e fica bloqueado', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    const usuario = userEvent.setup();
    desenhar();
    await usuario.click(screen.getByRole('button', { name: 'Compartilhar card' }));
    const principal = screen.getByRole<HTMLButtonElement>('button', {
      name: /Preparando o card/,
    });
    expect(principal.disabled).toBe(true);
  });

  it('se o card não carrega, avisa e mostra os outros caminhos', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 500 })));
    const usuario = userEvent.setup();
    desenhar();
    await usuario.click(screen.getByRole('button', { name: 'Compartilhar card' }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(
        'Não deu para carregar o card agora',
      );
    });
  });

  it('compartilhar entrega o arquivo à folha do aparelho', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(new Blob(['x']), { status: 200 })));
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    const usuario = userEvent.setup();
    desenhar();
    await usuario.click(screen.getByRole('button', { name: 'Compartilhar card' }));
    const principal = await screen.findByRole('button', { name: /Compartilhar ou copiar o card/ });
    await waitFor(() => {
      expect((principal as HTMLButtonElement).disabled).toBe(false);
    });
    await usuario.click(principal);
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('Card compartilhado.');
    });
    expect(share).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'canShare');
  });

  it('copiar só o link usa a área de transferência e confirma', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    const usuario = userEvent.setup();
    // O `setup` instala uma área de transferência própria: a de mentira entra depois dele.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    desenhar();
    await usuario.click(screen.getByRole('button', { name: 'Compartilhar card' }));
    await usuario.click(screen.getByRole('button', { name: 'Copiar só o link' }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).not.toBe('');
    });
    expect(writeText).toHaveBeenCalledWith('https://lumens.teste/p/bebedouros');
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('sem área de transferência, diz para selecionar o endereço à mão', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    const usuario = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    desenhar();
    await usuario.click(screen.getByRole('button', { name: 'Compartilhar card' }));
    await usuario.click(screen.getByRole('button', { name: 'Copiar só o link' }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Selecione o endereço');
    });
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('o endereço em texto é só leitura e se seleciona ao focar; o clique no fundo fecha', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    const usuario = userEvent.setup();
    desenhar();
    await usuario.click(screen.getByRole('button', { name: 'Compartilhar card' }));
    const campo = screen.getByLabelText<HTMLInputElement>('Endereço da pauta');
    expect(campo.readOnly).toBe(true);
    expect(campo.value).toBe('https://lumens.teste/p/bebedouros');
    const selecionar = vi.spyOn(campo, 'select');
    fireEvent.focus(campo);
    expect(selecionar).toHaveBeenCalled();
    await usuario.click(dialogo());
    expect(dialogo().hasAttribute('open')).toBe(false);
  });

  it('o link de baixar aponta para o PNG, com o nome do arquivo', () => {
    desenhar();
    const baixar = screen.getAllByRole('link', {
      name: /Baixar card da pauta Bebedouros/,
      hidden: true,
    })[0];
    expect(baixar?.getAttribute('href')).toBe('/p/bebedouros/card.png');
    expect(baixar?.getAttribute('download')).toBe('lumens-bebedouros.png');
  });
});

describe('FotosDoRelato (no navegador)', () => {
  const urls = ['/f/a.jpg', '/f/b.jpg', '/f/c.jpg'];
  const desenhar = (lista = urls) => render(<FotosDoRelato urls={lista} texto="Fio solto" />);
  const miniatura = (i: number) => screen.getAllByTitle('Ampliar a foto')[i] as HTMLAnchorElement;

  it('as miniaturas são links normais para a imagem, para quem está sem JavaScript', () => {
    desenhar();
    expect(screen.getAllByTitle('Ampliar a foto').map((a) => a.getAttribute('href'))).toEqual(urls);
  });

  it('tocar numa miniatura abre a foto inteira no diálogo, com a posição', async () => {
    const usuario = userEvent.setup();
    desenhar();
    await usuario.click(miniatura(1));
    expect(dialogo().hasAttribute('open')).toBe(true);
    expect(screen.getByText('Foto 2 de 3')).toBeTruthy();
  });

  it('Ctrl+clique deixa o navegador seguir o link', () => {
    desenhar();
    const livre = fireEvent.click(miniatura(0), { ctrlKey: true });
    expect(livre).toBe(true);
    expect(dialogo().hasAttribute('open')).toBe(false);
  });

  it('as setas e os botões passam entre as fotos, dando a volta', async () => {
    const usuario = userEvent.setup();
    desenhar();
    await usuario.click(miniatura(0));
    fireEvent.keyDown(dialogo(), { key: 'ArrowRight' });
    expect(screen.getByText('Foto 2 de 3')).toBeTruthy();
    fireEvent.keyDown(dialogo(), { key: 'ArrowLeft' });
    fireEvent.keyDown(dialogo(), { key: 'ArrowLeft' });
    expect(screen.getByText('Foto 3 de 3')).toBeTruthy();
    await usuario.click(screen.getByRole('button', { name: 'Próxima foto', hidden: true }));
    expect(screen.getByText('Foto 1 de 3')).toBeTruthy();
    await usuario.click(screen.getByRole('button', { name: 'Foto anterior', hidden: true }));
    expect(screen.getByText('Foto 3 de 3')).toBeTruthy();
  });

  it('arrastar o dedo na horizontal passa a foto; arrasto curto ou vertical não', async () => {
    const usuario = userEvent.setup();
    desenhar();
    await usuario.click(miniatura(0));
    const gesto = (x0: number, y0: number, x1: number, y1: number) => {
      fireEvent.touchStart(dialogo(), { touches: [{ clientX: x0, clientY: y0 }] });
      fireEvent.touchEnd(dialogo(), { changedTouches: [{ clientX: x1, clientY: y1 }] });
    };
    gesto(200, 100, 100, 100);
    expect(screen.getByText('Foto 2 de 3')).toBeTruthy();
    gesto(100, 100, 110, 100);
    gesto(100, 100, 100, 300);
    expect(screen.getByText('Foto 2 de 3')).toBeTruthy();
    gesto(100, 100, 220, 100);
    expect(screen.getByText('Foto 1 de 3')).toBeTruthy();
  });

  it('fechar devolve o foco à miniatura de onde abriu', async () => {
    const usuario = userEvent.setup();
    desenhar();
    await usuario.click(miniatura(2));
    await usuario.click(screen.getByRole('button', { name: 'Fechar a foto', hidden: true }));
    expect(dialogo().hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(miniatura(2));
  });

  it('o clique no fundo fecha; com uma foto só, não há setas e a legenda é "Foto do relato"', async () => {
    const usuario = userEvent.setup();
    desenhar(['/f/a.jpg']);
    await usuario.click(miniatura(0));
    expect(screen.queryByRole('button', { name: 'Próxima foto', hidden: true })).toBeNull();
    expect(screen.getByText('Foto do relato')).toBeTruthy();
    act(() => {
      fireEvent.click(dialogo());
    });
    expect(dialogo().hasAttribute('open')).toBe(false);
  });
});
