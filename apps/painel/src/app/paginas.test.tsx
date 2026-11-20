import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// As páginas do painel leem a sessão e o domínio. Aqui os dois são de mentira: o que se confere é
// quem entra, quem é mandado para o login, o que a página pede ao domínio e o que ela desenha.
const PAUTA = '00000004-0000-4000-8000-000000000001';

class Saiu extends Error {
  constructor(readonly para: string) {
    super(para);
  }
}

const mocks = vi.hoisted(() => ({
  sessao: undefined as { id: string; nome: string; papel: 'curador' | 'administrador' } | undefined,
  dominio: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock('next/navigation', () => ({
  redirect: (para: string) => {
    throw new Saiu(`redirect:${para}`);
  },
  permanentRedirect: (para: string) => {
    throw new Saiu(`permanente:${para}`);
  },
  notFound: () => {
    throw new Saiu('404');
  },
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next/font/local', () => ({
  default: () => ({ variable: 'fonte-teste', className: 'fonte-teste' }),
}));
vi.mock('../auth', () => ({
  curadorDaSessao: () => Promise.resolve(mocks.sessao),
  servidor: () => ({ db: {} }),
  chavesDeCurador: () => ({}),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));
vi.mock('@lumens/dominio', async (original) => {
  const real = await original<Record<string, unknown>>();
  for (const nome of [
    'resumoDaCuradoria',
    'visaoGeralDaCuradoria',
    'listarPautasDaCuradoria',
    'listarPedidosDeEdicaoPendentes',
    'listarRelatosPendentes',
    'detalharPautaDaCuradoria',
    'buscarPautaDaCuradoria',
    'documentosDeResposta',
  ]) {
    mocks.dominio[nome] = vi.fn();
  }
  return { ...real, ...mocks.dominio };
});

/** Roda a página e devolve o HTML, ou o que ela fez em vez de desenhar (redirecionar, 404). */
const abrir = async (pagina: () => unknown) => {
  try {
    return renderToStaticMarkup((await pagina()) as React.ReactElement);
  } catch (erro) {
    if (erro instanceof Saiu) return erro.para;
    throw erro;
  }
};

const resumo = {
  pautasParaDecidir: 1,
  pautasAtrasadas: 0,
  relatosPendentes: 2,
  pautasSemRespostaOficial: 3,
  conferenciasAbertas: 4,
  pedidosPendentes: 0,
};
const visao = {
  pautasPorStatus: [
    { status: 'em_curadoria', total: 1 },
    { status: 'cobrando', total: 2 },
  ],
  apoiosPorSemana: [],
};

beforeEach(() => {
  mocks.sessao = { id: 'c1', nome: 'Ana Curadora', papel: 'curador' };
  mocks.dominio.resumoDaCuradoria?.mockResolvedValue(resumo);
  mocks.dominio.visaoGeralDaCuradoria?.mockResolvedValue(visao);
});
afterEach(() => {
  for (const fn of Object.values(mocks.dominio)) fn.mockReset();
});

describe('páginas que exigem sessão', () => {
  it('sem sessão, cada uma leva ao login e não pede nada ao domínio', async () => {
    mocks.sessao = undefined;
    const { default: Home } = await import('./page');
    const { default: Pautas } = await import('./pautas/page');
    const { default: Pedidos } = await import('./pedidos/page');
    const { default: Relatos } = await import('./relatos/page');
    const { default: Manual } = await import('./manual/page');
    const { default: Pauta } = await import('./pautas/[id]/page');
    const { default: Promessa } = await import('./pautas/[id]/promessa/page');
    const busca = Promise.resolve({});
    const id = Promise.resolve({ id: PAUTA });
    expect(await abrir(() => Home())).toBe('redirect:/login');
    expect(await abrir(() => Pautas({ searchParams: busca }))).toBe('redirect:/login');
    expect(await abrir(() => Pedidos({ searchParams: busca }))).toBe('redirect:/login');
    expect(await abrir(() => Relatos({ searchParams: busca }))).toBe('redirect:/login');
    expect(await abrir(() => Manual())).toBe('redirect:/login');
    expect(await abrir(() => Pauta({ params: id, searchParams: busca }))).toBe('redirect:/login');
    expect(await abrir(() => Promessa({ params: id, searchParams: busca }))).toBe(
      'redirect:/login',
    );
    for (const fn of Object.values(mocks.dominio)) expect(fn).not.toHaveBeenCalled();
  }, 30_000);
});

describe('Início', () => {
  it('mostra o painel com o nome de quem entrou, sem o atalho de curadores para o curador comum', async () => {
    const { default: Home } = await import('./page');
    const html = await abrir(() => Home());
    expect(html).toContain('Ana Curadora');
    expect(html).toContain('Painel de curadoria');
    expect(html).not.toContain('>Curadores<');
  });

  it('o administrador vê "Curadores" na navegação', async () => {
    mocks.sessao = { id: 'a1', nome: 'Admin', papel: 'administrador' };
    const { default: Home } = await import('./page');
    expect(await abrir(() => Home())).toContain('Curadores');
  });
});

describe('Pautas', () => {
  beforeEach(() => {
    mocks.dominio.listarPautasDaCuradoria?.mockResolvedValue([]);
  });

  it('a lista abre em "esperando decisão" e entrega ao domínio os filtros, as pendências e a busca', async () => {
    const { default: Pautas } = await import('./pautas/page');
    const html = await abrir(() =>
      Pautas({
        searchParams: Promise.resolve({
          status: 'cobrando',
          q: 'sala',
          pendencia: 'sem_resposta_oficial',
        }),
      }),
    );
    expect(html).toContain('Pautas');
    expect(mocks.dominio.listarPautasDaCuradoria).toHaveBeenCalledWith(
      {},
      expect.any(Date),
      expect.objectContaining({
        q: 'sala',
        status: ['cobrando'],
        pendencia: ['sem_resposta_oficial'],
      }),
    );
  });

  it('sem parâmetros, a busca vai vazia', async () => {
    const { default: Pautas } = await import('./pautas/page');
    await abrir(() => Pautas({ searchParams: Promise.resolve({}) }));
    expect(mocks.dominio.listarPautasDaCuradoria).toHaveBeenCalledWith(
      {},
      expect.any(Date),
      expect.objectContaining({ q: '' }),
    );
  });
});

describe('Pedidos e relatos', () => {
  it('pedidos: sem nenhum, diz que nada espera decisão', async () => {
    mocks.dominio.listarPedidosDeEdicaoPendentes?.mockResolvedValue([]);
    const { default: Pedidos } = await import('./pedidos/page');
    const html = await abrir(() => Pedidos({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('Nenhum pedido esperando decisão.');
  });

  it('pedidos: um aviso ou erro conhecido aparece; um desconhecido não', async () => {
    mocks.dominio.listarPedidosDeEdicaoPendentes?.mockResolvedValue([]);
    const { default: Pedidos } = await import('./pedidos/page');
    const { ERRO_DE_PEDIDO } = await import('./pedidos/pedidos');
    const chave = Object.keys(ERRO_DE_PEDIDO)[0] ?? '';
    const com = await abrir(() => Pedidos({ searchParams: Promise.resolve({ erro: chave }) }));
    expect(com).toContain('role="alert"');
    const sem = await abrir(() => Pedidos({ searchParams: Promise.resolve({ erro: 'qualquer' }) }));
    expect(sem).not.toContain('role="alert"');
  });

  it('relatos: lista os pendentes com o aviso da tela', async () => {
    mocks.dominio.listarRelatosPendentes?.mockResolvedValue([]);
    const { default: Relatos } = await import('./relatos/page');
    const html = await abrir(() => Relatos({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('Relatos');
    expect(mocks.dominio.listarRelatosPendentes).toHaveBeenCalledTimes(1);
  });
});

describe('Manual', () => {
  it('mostra o manual da curadoria, com o papel de quem lê', async () => {
    const { default: Manual, metadata } = await import('./manual/page');
    expect(metadata.title).toBe('Manual da curadoria · Lumens');
    expect(await abrir(() => Manual())).toContain('Manual');
  });
});

describe('Pauta e promessa', () => {
  it('id que não é UUID dá 404 sem ir ao domínio', async () => {
    const { default: Pauta } = await import('./pautas/[id]/page');
    const { default: Promessa } = await import('./pautas/[id]/promessa/page');
    const busca = Promise.resolve({});
    expect(
      await abrir(() => Pauta({ params: Promise.resolve({ id: 'x' }), searchParams: busca })),
    ).toBe('404');
    expect(
      await abrir(() =>
        Promessa({ params: Promise.resolve({ id: '1; drop' }), searchParams: busca }),
      ),
    ).toBe('404');
    expect(mocks.dominio.detalharPautaDaCuradoria).not.toHaveBeenCalled();
    expect(mocks.dominio.buscarPautaDaCuradoria).not.toHaveBeenCalled();
  });

  it('pauta que não existe dá 404', async () => {
    mocks.dominio.detalharPautaDaCuradoria?.mockResolvedValue(undefined);
    mocks.dominio.buscarPautaDaCuradoria?.mockResolvedValue(undefined);
    const { default: Pauta } = await import('./pautas/[id]/page');
    const { default: Promessa } = await import('./pautas/[id]/promessa/page');
    const id = Promise.resolve({ id: PAUTA });
    expect(await abrir(() => Pauta({ params: id, searchParams: Promise.resolve({}) }))).toBe('404');
    expect(await abrir(() => Promessa({ params: id, searchParams: Promise.resolve({}) }))).toBe(
      '404',
    );
  });

  it('os links antigos da fila e da linha do tempo continuam valendo', async () => {
    const { default: Fila } = await import('./fila/page');
    const { default: Linha } = await import('./pautas/[id]/linha-do-tempo/page');
    expect(await abrir(() => Fila())).toBe('permanente:/pautas?status=em_curadoria');
    expect(await abrir(() => Linha({ params: Promise.resolve({ id: 'a b' }) }))).toBe(
      'permanente:/pautas/a%20b?linha=aberta#linha-do-tempo',
    );
  });
});

describe('telas de entrada e layout', () => {
  it('login pede o e-mail e promete um link sem senha', async () => {
    const { default: Login } = await import('./login/page');
    const html = await abrir(() => Login());
    expect(html).toContain('Entrar no painel');
    expect(html).toContain('type="email"');
    expect(html).toContain('required');
  });

  it('verifique o e-mail: a mesma tela para qualquer endereço, com o aviso como status', async () => {
    const { default: Verifique } = await import('./login/verifique/page');
    const html = await abrir(() => Verifique());
    expect(html).toContain('Verifique seu e-mail');
    expect(html).toContain('role="status"');
    expect(html).toContain('href="/login"');
  });

  it('erro de entrada oferece pedir um link novo', async () => {
    const { default: Erro } = await import('./login/erro/page');
    const html = await abrir(() => Erro());
    expect(html).toContain('Não foi possível entrar');
    expect(html).toContain('Pedir um link novo');
  });

  it('o layout é em português, fora dos buscadores e com as duas fontes', async () => {
    const { default: Layout, metadata } = await import('./layout');
    const html = renderToStaticMarkup(<Layout>conteúdo</Layout>);
    expect(html).toContain('lang="pt-BR"');
    expect(html).toContain('fonte-teste');
    expect(html).toContain('conteúdo');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
