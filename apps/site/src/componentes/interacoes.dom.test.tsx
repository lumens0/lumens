// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import exemplo from '../dados/blocos-teste.json';
import { blocosDaFolha } from '../dados/folha';
import { absorverOrdem, limparPendente, registrarOrdem } from '../dados/pendentes';
import type { PredioDoSkyline } from '../dados/skyline';
import type { Pauta, StatusPauta } from '../dados/tipos';
import { BlocosFiltraveis, EtapasFiltraveis } from './inicio/FiltrosDoInicio';
import { FolhaDeBlocos } from './inicio/FolhaDeBlocos';
import { Skyline } from './inicio/Skyline';
import { FiltrosDaLista } from './lista/FiltrosDaLista';
import { LinhaDePauta } from './lista/LinhaDePauta';
import { Numero } from './Numero';
import { Voltar } from './pauta/Voltar';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/',
}));

beforeEach(() => {
  replace.mockClear();
  // A escolha e a ordem pendentes são do módulo: o que um teste deixa não vale para o seguinte.
  limparPendente();
  registrarOrdem('atencao');
  absorverOrdem('atencao');
  vi.stubGlobal(
    'matchMedia',
    (consulta: string) =>
      ({
        matches: consulta.includes('reduce'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '5582999999999');
  // O jsdom não tem o <dialog> modal: estes dois são o que o navegador faria.
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

let n = 0;
const pauta = (status: StatusPauta, extra: Partial<Pauta> = {}): Pauta =>
  ({
    slug: `pauta-${String(++n)}`,
    titulo: `Pauta ${String(n)}`,
    descricao: 'Descrição da pauta.',
    categoria: 'infraestrutura',
    status,
    urgente: false,
    apoios: 40,
    meta: 100,
    bloco_slug: 'bloco-a',
    bloco_nome: 'Bloco A',
    ...extra,
  }) as Pauta;

describe('LinhaDePauta (no navegador)', () => {
  it('abre e fecha ao tocar no cabeçalho, e o conteúdo só fica ativo aberto', async () => {
    const usuario = userEvent.setup();
    const { container } = render(
      <ul>
        <LinhaDePauta pauta={pauta('juntando_apoios', { titulo: 'Carteiras' })} />
      </ul>,
    );
    const botao = screen.getByRole('button', { name: /Carteiras/ });
    const mais = container.querySelector('[id^="linha-"]');
    expect(botao.getAttribute('aria-expanded')).toBe('false');
    expect(mais?.hasAttribute('inert')).toBe(true);
    await usuario.click(botao);
    expect(botao.getAttribute('aria-expanded')).toBe('true');
    expect(mais?.hasAttribute('inert')).toBe(false);
    expect(screen.getByRole('link', { name: 'Ver a pauta' }).getAttribute('href')).toMatch(
      /^\/p\//,
    );
    await usuario.click(botao);
    expect(botao.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Voltar (no navegador)', () => {
  it('com histórico, volta para onde a pessoa estava e não navega para a lista', async () => {
    const voltar = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(3);
    const usuario = userEvent.setup();
    render(<Voltar />);
    await usuario.click(screen.getByRole('link', { name: /Voltar/ }));
    expect(voltar).toHaveBeenCalledTimes(1);
    voltar.mockRestore();
  });

  it('sem histórico (aba aberta direto), segue o link para a lista', () => {
    const voltar = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    render(<Voltar />);
    const livre = fireEvent.click(screen.getByRole('link', { name: /Voltar/ }));
    expect(voltar).not.toHaveBeenCalled();
    expect(livre).toBe(true);
    voltar.mockRestore();
  });
});

describe('Numero (no navegador)', () => {
  it('sobe de zero até o valor e termina no total', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: false }) as MediaQueryList);
    let quadro: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => {
      quadro = f;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const { container } = render(<Numero valor={120} />);
    const animado = () => container.querySelector('[aria-hidden="true"]')?.textContent;
    act(() => {
      quadro?.(450);
    });
    expect(Number(animado())).toBeGreaterThan(0);
    expect(Number(animado())).toBeLessThan(120);
    act(() => {
      quadro?.(900);
    });
    expect(animado()).toBe('120');
  });

  it('com menos movimento, mostra o valor direto', () => {
    const { container } = render(<Numero valor={57} />);
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('57');
  });
});

describe('filtros do Início (no navegador)', () => {
  it('tocar numa etapa pede o endereço com a etapa; tocar na marcada tira', async () => {
    const usuario = userEvent.setup();
    const { rerender } = render(
      <EtapasFiltraveis
        linhas={[{ status: 'cobrando', total: 2, largura: 100 }]}
        atual={{ status: [], bloco: [] }}
      />,
    );
    await usuario.click(screen.getByRole('button', { name: /Cobrando/ }));
    expect(replace).toHaveBeenLastCalledWith('/?status=cobrando', { scroll: false });
    rerender(
      <EtapasFiltraveis
        linhas={[{ status: 'cobrando', total: 2, largura: 100 }]}
        atual={{ status: ['cobrando'], bloco: [] }}
      />,
    );
    await usuario.click(screen.getByRole('button', { name: /Cobrando/ }));
    expect(replace).toHaveBeenLastCalledWith('/', { scroll: false });
  });

  it('tocar num bloco pede o endereço com o bloco', async () => {
    const usuario = userEvent.setup();
    render(
      <BlocosFiltraveis
        linhas={[{ slug: 'ic', nome: 'Instituto de Computação', apoios: 10, largura: 100 }]}
        atual={{ status: [], bloco: [] }}
      />,
    );
    await usuario.click(screen.getByRole('button', { name: /Instituto de Computação/ }));
    expect(replace).toHaveBeenLastCalledWith('/?bloco=ic', { scroll: false });
  });
});

describe('Skyline (no navegador)', () => {
  const predio: PredioDoSkyline = {
    slug: 'ic',
    nome: 'Instituto de Computação',
    sigla: 'IC',
    colunas: 2,
    linhas: 2,
    janelas: [
      { slug: 'p1', titulo: 'Pauta 1', status: 'cobrando', apoios: 5, urgente: false, fora: false },
      {
        slug: 'p2',
        titulo: 'Pauta 2',
        status: 'prometido',
        apoios: 9,
        urgente: false,
        fora: false,
      },
    ],
    mais: 0,
    escolhido: false,
    pautas: 2,
  };

  it('tocar numa janela mostra a pauta na legenda, com os caminhos; tocar de novo fecha', async () => {
    const usuario = userEvent.setup();
    render(<Skyline predios={[predio]} legenda="Toque numa janela." />);
    expect(screen.getByText('Toque numa janela.')).toBeTruthy();
    const janela = screen.getByRole('button', { name: /Pauta 1, Cobrando, 5 apoios/ });
    expect(janela.getAttribute('aria-pressed')).toBe('false');
    await usuario.click(janela);
    expect(janela.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('link', { name: 'Abrir pauta' }).getAttribute('href')).toBe('/p/p1');
    expect(screen.getByRole('link', { name: 'Ver na lista' }).getAttribute('href')).toBe(
      '/pautas?bloco=ic',
    );
    expect(screen.getByRole('link', { name: 'Ver no mapa' }).getAttribute('href')).toBe('/mapa');
    await usuario.click(janela);
    expect(screen.getByText('Toque numa janela.')).toBeTruthy();
  });

  it('trocar de janela troca a pauta da legenda', async () => {
    const usuario = userEvent.setup();
    render(<Skyline predios={[predio]} legenda="x" />);
    await usuario.click(screen.getByRole('button', { name: /Pauta 1/ }));
    await usuario.click(screen.getByRole('button', { name: /Pauta 2/ }));
    expect(screen.getByRole('link', { name: 'Abrir pauta' }).getAttribute('href')).toBe('/p/p2');
  });

  it('se a janela aberta some dos dados, a legenda volta ao texto de ajuda', async () => {
    const usuario = userEvent.setup();
    const { rerender } = render(<Skyline predios={[predio]} legenda="Ajuda." />);
    await usuario.click(screen.getByRole('button', { name: /Pauta 1/ }));
    rerender(
      <Skyline predios={[{ ...predio, janelas: predio.janelas.slice(1) }]} legenda="Ajuda." />,
    );
    expect(screen.getByText('Ajuda.')).toBeTruthy();
  });

  it('a luz acompanha o ponteiro: a janela mais perto brilha mais', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }) as MediaQueryList);
    const fila: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => fila.push(f));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const passar = () => {
      act(() => {
        fila.splice(0).forEach((f) => {
          f(0);
        });
      });
    };
    const { container } = render(<Skyline predios={[predio]} legenda="x" />);
    const [perto, longe] = [...container.querySelectorAll<HTMLElement>('button[data-janela]')];
    vi.spyOn(perto as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 10,
      height: 10,
      right: 110,
      bottom: 110,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });
    vi.spyOn(longe as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      left: 900,
      top: 900,
      width: 10,
      height: 10,
      right: 910,
      bottom: 910,
      x: 900,
      y: 900,
      toJSON: () => ({}),
    });
    fireEvent.pointerMove(container.firstElementChild as Element, { clientX: 105, clientY: 105 });
    passar();
    expect(Number(perto?.style.getPropertyValue('--g'))).toBeGreaterThan(0.9);
    expect(Number(longe?.style.getPropertyValue('--g'))).toBe(0);
    fireEvent.pointerLeave(container.firstElementChild as Element);
    passar();
    expect(Number(perto?.style.getPropertyValue('--g'))).toBe(0);
  });
});

describe('FolhaDeBlocos (no navegador)', () => {
  const siglas = Object.fromEntries(exemplo.blocos.map((b) => [b.slug, b.slug.toUpperCase()]));
  const pautas = [
    pauta('cobrando', { slug: 'p1', bloco_slug: 'bloco-a' }),
    pauta('prometido', { slug: 'p2', bloco_slug: 'bloco-b' }),
  ];
  const desenhar = (bloco: string[] = [], extra: Record<string, unknown> = {}) =>
    render(
      <FolhaDeBlocos
        base="/"
        blocos={blocosDaFolha(exemplo.blocos, siglas, pautas, [])}
        catalogo={exemplo.blocos}
        siglas={siglas}
        pautas={pautas}
        atual={{ status: [], bloco }}
        {...extra}
      />,
    );
  const dialogo = () => document.querySelector('dialog') as HTMLDialogElement;

  it('abrir mostra o diálogo e trava a rolagem; ✕ fecha sem filtrar e destrava', async () => {
    const usuario = userEvent.setup();
    desenhar();
    await usuario.click(screen.getByRole('button', { name: /Escolher entre os/ }));
    expect(dialogo().hasAttribute('open')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    await usuario.click(screen.getByRole('button', { name: 'Fechar sem filtrar', hidden: true }));
    expect(dialogo().hasAttribute('open')).toBe(false);
    expect(document.body.style.overflow).toBe('');
    expect(replace).not.toHaveBeenCalled();
  });

  it('sem bloco escolhido o botão final fica bloqueado; escolhendo, habilita e aplica', async () => {
    const usuario = userEvent.setup();
    desenhar();
    await usuario.click(screen.getByRole('button', { name: /Escolher entre os/ }));
    const aplicar = screen.getByRole('button', {
      name: 'Escolha um bloco para continuar',
      hidden: true,
    });
    expect((aplicar as HTMLButtonElement).disabled).toBe(true);
    const primeiro = exemplo.blocos[0];
    await usuario.click(
      screen.getByRole('button', { name: new RegExp(primeiro?.nome ?? ''), hidden: true }),
    );
    const filtrar = screen.getByRole('button', { name: 'Filtrar por 1 bloco', hidden: true });
    expect((filtrar as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('status', { hidden: true }).textContent).toContain('1 bloco escolhido');
    await usuario.click(filtrar);
    expect(replace).toHaveBeenCalledWith(`/?bloco=${primeiro?.slug ?? ''}`, { scroll: false });
    expect(dialogo().hasAttribute('open')).toBe(false);
  });

  it('tocar num bloco escolhido o desmarca', async () => {
    const usuario = userEvent.setup();
    desenhar([exemplo.blocos[0]?.slug ?? '']);
    await usuario.click(screen.getByRole('button', { name: /Escolher entre os/ }));
    const chip = screen.getByRole('button', {
      name: new RegExp(exemplo.blocos[0]?.nome ?? ''),
      hidden: true,
    });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    await usuario.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('a busca filtra os blocos sem acento e avisa quando nada casa', async () => {
    const usuario = userEvent.setup();
    desenhar();
    await usuario.click(screen.getByRole('button', { name: /Escolher entre os/ }));
    const busca = screen.getByPlaceholderText('Buscar bloco por nome ou sigla');
    await usuario.type(busca, 'zzzzzz');
    expect(screen.getByText('Nenhum bloco com esse nome ou sigla.')).toBeTruthy();
    await usuario.clear(busca);
    expect(screen.queryByText('Nenhum bloco com esse nome ou sigla.')).toBeNull();
  });

  it('o clique no fundo do diálogo fecha; o clique dentro, não', async () => {
    const usuario = userEvent.setup();
    desenhar();
    await usuario.click(screen.getByRole('button', { name: /Escolher entre os/ }));
    await usuario.click(screen.getByRole('heading', { name: 'Escolher blocos', hidden: true }));
    expect(dialogo().hasAttribute('open')).toBe(true);
    await usuario.click(dialogo());
    expect(dialogo().hasAttribute('open')).toBe(false);
  });

  it('com montarUrl, o endereço vem do chamador (busca e ordem preservadas)', async () => {
    const usuario = userEvent.setup();
    const montarUrl = vi.fn((blocos: string[]) => `/pautas?q=sala&bloco=${blocos.join(',')}`);
    desenhar([], { base: '/pautas', montarUrl });
    await usuario.click(screen.getByRole('button', { name: /Escolher entre os/ }));
    await usuario.click(
      screen.getByRole('button', { name: new RegExp(exemplo.blocos[0]?.nome ?? ''), hidden: true }),
    );
    await usuario.click(screen.getByRole('button', { name: 'Filtrar por 1 bloco', hidden: true }));
    expect(replace).toHaveBeenCalledWith(`/pautas?q=sala&bloco=${exemplo.blocos[0]?.slug ?? ''}`, {
      scroll: false,
    });
  });
});

describe('FiltrosDaLista (no navegador)', () => {
  const etapas = {
    juntando_apoios: 2,
    meta_batida: 0,
    cobrando: 1,
    prometido: 0,
    entregue_em_parte: 0,
    descumprida: 0,
    conquistada: 0,
  };
  const blocos = [
    { slug: 'ic', nome: 'Instituto de Computação', sigla: 'IC', pautas: 2 },
    { slug: 'bc', nome: 'Biblioteca Central', sigla: 'BC', pautas: 0 },
  ];
  const desenhar = (extra: Partial<Parameters<typeof FiltrosDaLista>[0]> = {}) =>
    render(
      <FiltrosDaLista
        q=""
        ordem="atencao"
        status={[]}
        bloco={[]}
        etapas={etapas}
        totalDaBusca={3}
        blocos={blocos}
        totalDeBlocos={2}
        sugestoes={null}
        ativos={null}
        {...extra}
      />,
    );

  it('digitar espera uma pausa curta e então busca, uma vez só', () => {
    vi.useFakeTimers();
    desenhar();
    const campo = screen.getByRole('searchbox');
    fireEvent.change(campo, { target: { value: 'sa' } });
    fireEvent.change(campo, { target: { value: 'sala' } });
    expect(replace).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0]?.[0]).toContain('q=sala');
  });

  it('a busca que chega de fora (por exemplo, "Limpar tudo") reescreve o campo', () => {
    const { rerender } = desenhar({ q: 'sala' });
    expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('sala');
    rerender(
      <FiltrosDaLista
        q=""
        ordem="atencao"
        status={[]}
        bloco={[]}
        etapas={etapas}
        totalDaBusca={3}
        blocos={blocos}
        totalDeBlocos={2}
        sugestoes={null}
        ativos={null}
      />,
    );
    expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('');
  });

  it('trocar a ordem pede o endereço com a nova ordem', async () => {
    const usuario = userEvent.setup();
    desenhar();
    const ordem = screen.getByRole('combobox');
    const outra = [...(ordem as HTMLSelectElement).options].find((o) => o.value !== 'atencao');
    await usuario.selectOptions(ordem, outra?.value ?? '');
    expect(replace.mock.calls.at(-1)?.[0]).toContain(`ordem=${outra?.value ?? ''}`);
  });

  it('tocar numa etapa filtra por ela; "Todas" limpa as etapas', async () => {
    const usuario = userEvent.setup();
    desenhar();
    await usuario.click(screen.getByRole('button', { name: /Cobrando/ }));
    expect(replace.mock.calls.at(-1)?.[0]).toContain('status=cobrando');
    cleanup();
    desenhar({ status: ['cobrando'] });
    await usuario.click(screen.getByRole('button', { name: /^Todas/ }));
    expect(replace.mock.calls.at(-1)?.[0]).not.toContain('status=');
  });

  it('a lista de blocos abre e fecha, e escolher um bloco filtra por ele', async () => {
    const usuario = userEvent.setup();
    desenhar();
    const abrir = screen.getByRole('button', { name: /Escolher entre os 2 blocos/ });
    expect(abrir.getAttribute('aria-expanded')).toBe('false');
    await usuario.click(abrir);
    expect(
      screen
        .getByRole('button', { name: 'Fechar a lista de blocos' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
    const lista = within(screen.getByRole('list', { name: 'Todos os blocos do campus' }));
    await usuario.click(lista.getByRole('button', { name: /Biblioteca Central/ }));
    expect(replace.mock.calls.at(-1)?.[0]).toContain('bloco=bc');
  });
});
