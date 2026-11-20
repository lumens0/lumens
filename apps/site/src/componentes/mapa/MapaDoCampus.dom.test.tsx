// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pauta, StatusPauta } from '../../dados/tipos';
import { MapaDoCampus } from './MapaDoCampus';
import { PREDIOS } from './predios';
import type { MarcadorDoBloco } from './urgencia';

let n = 0;
const pauta = (status: StatusPauta, extra: Partial<Pauta> = {}): Pauta =>
  ({
    slug: `pauta-${String(++n)}`,
    titulo: `Pauta ${String(n)}`,
    categoria: 'infraestrutura',
    status,
    urgente: false,
    apoios: 40,
    meta: 100,
    bloco_slug: 'ic',
    bloco_nome: 'IC',
    ...extra,
  }) as Pauta;

const predioDe = (slug: string) => {
  const predio = PREDIOS.find((p) => p.blocos.includes(slug));
  if (!predio) throw new Error(`sem prédio para ${slug}`);
  return predio.id;
};

const marcador = (slug: string, nome: string, pautas: Pauta[]): MarcadorDoBloco => ({
  slug,
  nome,
  predio: predioDe(slug),
  abertas: pautas.length,
  cor: '#fff',
  urgente: false,
  linha: '',
  pautas,
});

const marcadores = () => [
  marcador('ic', 'Instituto de Computação', [
    pauta('cobrando', { titulo: 'Ar-condicionado' }),
    pauta('juntando_apoios', { titulo: 'Carteiras', urgente: true }),
  ]),
  marcador('residencia-universitaria', 'Residência Universitária', [
    pauta('descumprida', { titulo: 'Água quente' }),
  ]),
  marcador('ichca', 'ICHCA', []),
];

const palco = () => screen.getByRole('application');
const caixaDoSvg = () => {
  const svg = palco().querySelector('svg');
  const [x = 0, y = 0, w = 0] = (svg?.getAttribute('viewBox') ?? '').split(' ').map(Number);
  return { x, y, w };
};

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    (consulta: string) =>
      ({
        matches: consulta.includes('reduce'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  // O jsdom não tem layout: o palco mede 800 × 600, o que o `clientWidth`/`clientHeight` devolveriam.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  Element.prototype.setPointerCapture = vi.fn();
  vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '5582999999999');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('MapaDoCampus (no navegador)', () => {
  it('abre com todos os blocos com pauta na lista, do que mais pede atenção ao que menos pede', () => {
    render(<MapaDoCampus marcadores={marcadores()} />);
    expect(screen.getByRole('heading', { name: 'Onde há pautas' })).toBeTruthy();
    expect(screen.getByText(/2 blocos acesos · 3 pautas/)).toBeTruthy();
    const itens = screen
      .getAllByRole('button', { name: /pauta/ })
      .filter((b) => b.className.includes('item'));
    // O IC tem uma pauta marcada como urgente: vem antes da promessa descumprida da Residência.
    expect(itens[0]?.textContent).toContain('Instituto de Computação');
    expect(itens[1]?.textContent).toContain('Residência Universitária');
  });

  it('o chip de cada etapa mostra a contagem; etapa sem pauta não tem chip', () => {
    render(<MapaDoCampus marcadores={marcadores()} />);
    const chips = within(screen.getByRole('group', { name: 'Mostrar no mapa' }));
    expect(chips.getByRole('button', { name: /Cobrando\s*1/ })).toBeTruthy();
    expect(chips.getByRole('button', { name: /Descumprida\s*1/ })).toBeTruthy();
    expect(chips.queryByRole('button', { name: /Prometido/ })).toBeNull();
  });

  it('filtrar por etapa deixa só os blocos dela; "Tudo aceso" desfaz', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={marcadores()} />);
    const chips = within(screen.getByRole('group', { name: 'Mostrar no mapa' }));
    await usuario.click(chips.getByRole('button', { name: /Cobrando/ }));
    expect(chips.getByRole('button', { name: /Cobrando/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByText(/1 bloco aceso · 1 pauta/)).toBeTruthy();
    await usuario.click(chips.getByRole('button', { name: 'Tudo aceso' }));
    expect(screen.getByText(/2 blocos acesos · 3 pautas/)).toBeTruthy();
  });

  it('filtrar por uma etapa que o bloco escolhido não tem volta à lista de blocos', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={marcadores()} />);
    await usuario.click(screen.getByRole('button', { name: /Instituto de Computação/ }));
    await usuario.click(screen.getByRole('button', { name: /Descumprida/ }));
    expect(screen.getByRole('heading', { name: 'Onde há pautas' })).toBeTruthy();
    expect(screen.getByText(/1 bloco aceso · 1 pauta/)).toBeTruthy();
  });

  it('escolher um bloco mostra as pautas dele, da mais urgente à menos, e aproxima a câmera', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={marcadores()} />);
    const antes = caixaDoSvg().w;
    await usuario.click(screen.getByRole('button', { name: /Instituto de Computação/ }));
    expect(screen.getByRole('heading', { name: 'Instituto de Computação' })).toBeTruthy();
    expect(screen.getByText('2 pautas neste bloco.')).toBeTruthy();
    const links = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href')?.startsWith('/p/'));
    // A pauta urgente (Carteiras) vem antes da que está sendo cobrada.
    expect(links.map((a) => a.textContent)).toEqual(['Carteiras', 'Ar-condicionado']);
    expect(caixaDoSvg().w).toBeLessThan(antes);
    expect(screen.getByText('Viu outro problema aqui?')).toBeTruthy();
  });

  it('a pauta urgente e a categoria aparecem na linha de detalhe', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={marcadores()} />);
    await usuario.click(screen.getByRole('button', { name: /Instituto de Computação/ }));
    expect(screen.getByText(/Urgente/)).toBeTruthy();
    expect(screen.getAllByText(/Infraestrutura/i).length).toBeGreaterThan(0);
  });

  it('com o bot configurado, oferece "Apoiar" (só a pauta que aceita) e "Criar pauta neste bloco"', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={marcadores()} />);
    await usuario.click(screen.getByRole('button', { name: /Instituto de Computação/ }));
    const apoiar = screen.getAllByRole('link', { name: /Apoiar pelo/ });
    expect(apoiar).toHaveLength(2);
    expect(apoiar[0]?.getAttribute('href')).toContain('apoiar');
    const criar = screen.getByRole('link', { name: /Criar pauta neste bloco/ });
    expect(decodeURIComponent(criar.getAttribute('href') ?? '')).toContain('nova pauta ic');
    expect(criar.getAttribute('rel')).toContain('noopener');
  });

  it('sem bot configurado, não há botão de apoiar nem de criar pauta', async () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_BOT', '');
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={marcadores()} />);
    await usuario.click(screen.getByRole('button', { name: /Instituto de Computação/ }));
    expect(screen.queryByRole('link', { name: /Apoiar pelo/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Criar pauta/ })).toBeNull();
  });

  it('"Todos os blocos" volta à lista', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={marcadores()} />);
    await usuario.click(screen.getByRole('button', { name: /Instituto de Computação/ }));
    await usuario.click(screen.getByRole('button', { name: /Todos os blocos/ }));
    expect(screen.getByRole('heading', { name: 'Onde há pautas' })).toBeTruthy();
  });

  it('abre já no bloco pedido pela URL; bloco desconhecido abre na lista', () => {
    const { unmount } = render(
      <MapaDoCampus marcadores={marcadores()} blocoInicial="residencia-universitaria" />,
    );
    expect(screen.getByRole('heading', { name: 'Residência Universitária' })).toBeTruthy();
    unmount();
    render(<MapaDoCampus marcadores={marcadores()} blocoInicial="nao-existe" />);
    expect(screen.getByRole('heading', { name: 'Onde há pautas' })).toBeTruthy();
  });

  it('bloco sem pauta convida a relatar um problema no prédio', () => {
    render(<MapaDoCampus marcadores={marcadores()} blocoInicial="ichca" />);
    expect(screen.getByText('Nenhuma pauta neste bloco ainda.')).toBeTruthy();
    expect(
      screen.getByText('Viu algum problema neste prédio? Ele pode virar uma pauta.'),
    ).toBeTruthy();
  });

  it('a alça da gaveta abre e recolhe a lista', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={marcadores()} />);
    const alca = screen.getByRole('button', { name: 'Expandir lista' });
    expect(alca.getAttribute('aria-expanded')).toBe('false');
    await usuario.click(alca);
    expect(
      screen.getByRole('button', { name: 'Recolher lista' }).getAttribute('aria-expanded'),
    ).toBe('true');
    await usuario.click(screen.getByRole('button', { name: 'Recolher lista' }));
    expect(screen.getByRole('button', { name: 'Expandir lista' })).toBeTruthy();
  });
});

describe('câmera do MapaDoCampus (no navegador)', () => {
  it('+ aproxima, − afasta e o botão de enquadrar volta ao geral', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={marcadores()} />);
    const inicial = caixaDoSvg().w;
    await usuario.click(screen.getByRole('button', { name: 'Aproximar' }));
    const perto = caixaDoSvg().w;
    expect(perto).toBeLessThan(inicial);
    await usuario.click(screen.getByRole('button', { name: 'Afastar' }));
    await usuario.click(screen.getByRole('button', { name: 'Afastar' }));
    expect(caixaDoSvg().w).toBeGreaterThan(perto);
    await usuario.click(screen.getByRole('button', { name: 'Ver todos os blocos com pautas' }));
    expect(caixaDoSvg().w).toBeCloseTo(inicial, 3);
  });

  it('as setas movem a câmera, + e − aproximam e afastam, e Esc solta o bloco', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={marcadores()} />);
    await usuario.click(screen.getByRole('button', { name: /Instituto de Computação/ }));
    const antes = caixaDoSvg();
    palco().focus();
    await usuario.keyboard('{ArrowRight}');
    expect(caixaDoSvg().x).toBeGreaterThan(antes.x);
    await usuario.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(caixaDoSvg().x).toBeLessThan(antes.x);
    await usuario.keyboard('{ArrowDown}');
    expect(caixaDoSvg().y).toBeGreaterThan(antes.y);
    await usuario.keyboard('{ArrowUp}{ArrowUp}');
    expect(caixaDoSvg().y).toBeLessThan(antes.y);
    await usuario.keyboard('+');
    expect(caixaDoSvg().w).toBeLessThan(antes.w);
    await usuario.keyboard('-');
    await usuario.keyboard('{Escape}');
    expect(screen.getByRole('heading', { name: 'Onde há pautas' })).toBeTruthy();
  });

  it('a roda do mouse aproxima ou afasta, e a página não rola', () => {
    render(<MapaDoCampus marcadores={marcadores()} />);
    const antes = caixaDoSvg().w;
    const proibiu = !fireEvent.wheel(palco(), { deltaY: -200, clientX: 100, clientY: 100 });
    expect(proibiu).toBe(true);
    const perto = caixaDoSvg().w;
    expect(perto).toBeLessThan(antes);
    fireEvent.wheel(palco(), { deltaY: 400, clientX: 100, clientY: 100 });
    expect(caixaDoSvg().w).toBeGreaterThan(perto);
  });

  it('arrastar leva a câmera no sentido contrário e esconde a dica', () => {
    render(<MapaDoCampus marcadores={marcadores()} />);
    const dica = screen.getByText(/Arraste para mover/);
    expect(dica.className).not.toContain('dicaOculta');
    const antes = caixaDoSvg();
    fireEvent.pointerDown(palco(), { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(palco(), { pointerId: 1, clientX: 160, clientY: 120 });
    fireEvent.pointerUp(palco(), { pointerId: 1, clientX: 160, clientY: 120, button: 0 });
    const depois = caixaDoSvg();
    expect(depois.x).toBeLessThan(antes.x);
    expect(depois.y).toBeLessThan(antes.y);
    expect(screen.getByText(/Arraste para mover/).className).toContain('dicaOculta');
  });

  it('a pinça com dois dedos se afastando aproxima o mapa', () => {
    render(<MapaDoCampus marcadores={marcadores()} />);
    const antes = caixaDoSvg().w;
    fireEvent.pointerDown(palco(), { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerDown(palco(), { pointerId: 2, clientX: 200, clientY: 100, button: 0 });
    fireEvent.pointerMove(palco(), { pointerId: 2, clientX: 400, clientY: 100 });
    expect(caixaDoSvg().w).toBeLessThan(antes);
    fireEvent.pointerUp(palco(), { pointerId: 2, button: 0 });
    fireEvent.pointerUp(palco(), { pointerId: 1, button: 0 });
  });

  it('um toque sobre um prédio aceso escolhe o bloco; um toque no vazio solta', () => {
    render(<MapaDoCampus marcadores={marcadores()} />);
    const aceso = palco().querySelector('[data-k="ic"]');
    expect(aceso).not.toBeNull();
    document.elementFromPoint = vi.fn(() => aceso);
    fireEvent.pointerDown(palco(), { pointerId: 1, clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerUp(palco(), { pointerId: 1, clientX: 10, clientY: 10, button: 0 });
    expect(screen.getByRole('heading', { name: 'Instituto de Computação' })).toBeTruthy();
    document.elementFromPoint = vi.fn(() => palco());
    fireEvent.pointerDown(palco(), { pointerId: 1, clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerUp(palco(), { pointerId: 1, clientX: 10, clientY: 10, button: 0 });
    expect(screen.getByRole('heading', { name: 'Onde há pautas' })).toBeTruthy();
  });

  it('o botão do meio e o menu de contexto não abrem nada', () => {
    render(<MapaDoCampus marcadores={marcadores()} />);
    expect(fireEvent.contextMenu(palco())).toBe(false);
    const aceso = palco().querySelector('[data-k="ic"]');
    document.elementFromPoint = vi.fn(() => aceso);
    fireEvent.pointerDown(palco(), { pointerId: 1, clientX: 10, clientY: 10, button: 1 });
    fireEvent.pointerUp(palco(), { pointerId: 1, clientX: 10, clientY: 10, button: 1 });
    expect(screen.getByRole('heading', { name: 'Onde há pautas' })).toBeTruthy();
  });

  it('um arrasto longo que termina sobre um prédio não conta como toque', () => {
    render(<MapaDoCampus marcadores={marcadores()} />);
    const aceso = palco().querySelector('[data-k="ic"]');
    document.elementFromPoint = vi.fn(() => aceso);
    fireEvent.pointerDown(palco(), { pointerId: 1, clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerMove(palco(), { pointerId: 1, clientX: 90, clientY: 10 });
    fireEvent.pointerUp(palco(), { pointerId: 1, clientX: 90, clientY: 10, button: 0 });
    expect(screen.getByRole('heading', { name: 'Onde há pautas' })).toBeTruthy();
  });

  it('com a câmera aproximada, o mapa liga o modo "perto" (todos os nomes)', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={marcadores()} />);
    expect(palco().className).not.toContain('perto');
    await act(async () => {
      for (let i = 0; i < 6; i++)
        await usuario.click(screen.getByRole('button', { name: 'Aproximar' }));
    });
    expect(palco().className).toContain('perto');
  });
});

describe('blocos sem prédio e blocos que dividem um prédio (no navegador)', () => {
  const chipDe = (nome: RegExp) =>
    within(screen.getByRole('group', { name: 'Mostrar no mapa' })).getByRole('button', {
      name: nome,
    });
  const compartilhado = PREDIOS.find((p) => p.blocos.length > 1);
  const [a = '', b = ''] = compartilhado?.blocos ?? [];
  const doPredio = () => [
    marcador(a, `Bloco ${a}`, [pauta('juntando_apoios', { titulo: 'Pauta do A' })]),
    marcador(b, `Bloco ${b}`, [pauta('cobrando', { titulo: 'Pauta do B' })]),
  ];
  const campus = (): MarcadorDoBloco => ({
    slug: '_campus',
    nome: 'Todo o campus',
    predio: undefined,
    abertas: 1,
    cor: '#fff',
    urgente: false,
    linha: '',
    pautas: [pauta('cobrando', { titulo: 'Pauta de todo o campus', bloco_slug: null })],
  });

  it('a pauta de todo o campus continua na lista, abre na gaveta e cria pauta sem bloco', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={[...marcadores(), campus()]} />);
    expect(screen.getByText(/3 blocos acesos · 4 pautas/)).toBeTruthy();
    await usuario.click(screen.getByRole('button', { name: /Todo o campus/ }));
    expect(screen.getByRole('heading', { name: 'Todo o campus' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pauta de todo o campus' })).toBeTruthy();
    const criar = screen.getByRole('link', { name: /Criar pauta neste bloco/ });
    expect(decodeURIComponent(criar.getAttribute('href') ?? '')).toMatch(/nova pauta$/);
  });

  it('escolher um bloco sem prédio não mexe na câmera', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={[...marcadores(), campus()]} />);
    const antes = caixaDoSvg();
    await usuario.click(screen.getByRole('button', { name: /Todo o campus/ }));
    expect(caixaDoSvg()).toEqual(antes);
  });

  it('dois blocos no mesmo prédio aparecem separados na lista, cada um com as suas pautas', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={doPredio()} />);
    expect(screen.getByRole('button', { name: new RegExp(`Bloco ${b}`) })).toBeTruthy();
    await usuario.click(screen.getByRole('button', { name: new RegExp(`Bloco ${a}`) }));
    expect(screen.getByRole('heading', { name: `Bloco ${a}` })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pauta do A' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Pauta do B' })).toBeNull();
    await usuario.click(screen.getByRole('button', { name: /Todos os blocos/ }));
    await usuario.click(screen.getByRole('button', { name: new RegExp(`Bloco ${b}`) }));
    expect(screen.getByRole('heading', { name: `Bloco ${b}` })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pauta do B' })).toBeTruthy();
  });

  it('"Criar pauta neste bloco" usa o bloco que está aberto, não o primeiro do prédio', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={doPredio()} />);
    await usuario.click(screen.getByRole('button', { name: new RegExp(`Bloco ${b}`) }));
    const criar = screen.getByRole('link', { name: /Criar pauta neste bloco/ });
    expect(decodeURIComponent(criar.getAttribute('href') ?? '')).toContain(`nova pauta ${b}`);
    expect(criar.getAttribute('aria-label')).toContain(`Bloco ${b}`);
  });

  it('?bloco= abre qualquer um dos blocos do prédio, e não só o primeiro', () => {
    render(<MapaDoCampus marcadores={doPredio()} blocoInicial={b} />);
    expect(screen.getByRole('heading', { name: `Bloco ${b}` })).toBeTruthy();
  });

  it('tocar no prédio escolhe o primeiro bloco com pauta na etapa filtrada', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={doPredio()} />);
    await usuario.click(chipDe(/Cobrando/));
    const alvo = palco().querySelector('path[data-k]:not([data-k=""])');
    expect(alvo?.getAttribute('data-k')).toBe(b);
  });

  it('a conquista que ainda carrega a marca de urgência não pinta o prédio de "só conquistas"', async () => {
    const usuario = userEvent.setup();
    render(
      <MapaDoCampus
        marcadores={[
          marcador('ic', 'Instituto de Computação', [
            pauta('conquistada', { titulo: 'Já entregue', urgente: true }),
            pauta('descumprida', { titulo: 'Ainda cobrada' }),
          ]),
        ]}
      />,
    );
    expect(screen.getByText(/Promessa descumprida/)).toBeTruthy();
    expect(screen.queryByText(/Só conquistas/)).toBeNull();
    await usuario.click(screen.getByRole('button', { name: /Instituto de Computação/ }));
    const links = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href')?.startsWith('/p/'));
    expect(links.map((a) => a.textContent)).toEqual(['Ainda cobrada', 'Já entregue']);
  });

  it('os blocos sem pauta ficam numa lista acessível, e dá para escolhê-los e criar a primeira pauta', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={marcadores()} />);
    const resumo = screen.getByText(/Blocos sem pauta \(1\)/);
    expect(resumo.closest('details')).not.toBeNull();
    await usuario.click(resumo);
    await usuario.click(screen.getByRole('button', { name: /ICHCA/ }));
    expect(screen.getByRole('heading', { name: 'ICHCA' })).toBeTruthy();
    expect(screen.getByText('Nenhuma pauta neste bloco ainda.')).toBeTruthy();
    const criar = screen.getByRole('link', { name: /Criar pauta neste bloco/ });
    expect(decodeURIComponent(criar.getAttribute('href') ?? '')).toContain('nova pauta ichca');
  });

  it('com um filtro de etapa, a lista de baixo mostra os blocos sem pauta nessa etapa', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={marcadores()} />);
    await usuario.click(chipDe(/Cobrando/));
    expect(screen.getByText(/Blocos sem pauta nessa etapa \(2\)/)).toBeTruthy();
  });

  it('os blocos sem pauta se alcançam só com o teclado', async () => {
    const usuario = userEvent.setup();
    render(<MapaDoCampus marcadores={marcadores()} />);
    const resumo = screen.getByText(/Blocos sem pauta \(1\)/);
    resumo.closest('summary')?.focus();
    await usuario.keyboard('{Enter}');
    await usuario.tab();
    expect(document.activeElement?.textContent).toContain('ICHCA');
    await usuario.keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: 'ICHCA' })).toBeTruthy();
  });
});
