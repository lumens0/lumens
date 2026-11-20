import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// As ações do servidor ligam o formulário, a sessão e o domínio. Aqui a sessão e o domínio são de
// mentira: o que se confere é o que sai do formulário, o que vai ao domínio e para onde se redireciona.
const PAUTA = '00000004-0000-4000-8000-000000000001';

class Redirecionou extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}

const mocks = vi.hoisted(() => ({
  curador: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  dominio: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Redirecionou(url);
  },
}));
vi.mock('../auth', () => ({
  curadorDaSessao: mocks.curador,
  servidor: () => ({ db: { transaction: (fn: (tx: object) => unknown) => fn({}) } }),
  chavesDeCurador: () => ({}),
  signIn: mocks.signIn,
  signOut: mocks.signOut,
}));
vi.mock('@lumens/dominio', async (original) => {
  const real = await original<Record<string, unknown>>();
  const nomes = [
    'aprovarPauta',
    'recusarPauta',
    'marcarUrgencia',
    'recusarRelatoDeOrigem',
    'definirCategoria',
    'corrigirBloco',
    'ajustarMeta',
    'aprovarRelato',
    'recusarRelato',
    'recusarFoto',
    'decidirPedidoDeEdicao',
    'registrarPromessa',
    'registrarProrrogacao',
    'corrigirDataDoProtocolo',
    'remarcarDataPrometida',
    'adicionarCurador',
    'desativarCurador',
    'reativarCurador',
  ];
  for (const nome of nomes) mocks.dominio[nome] = vi.fn();
  return { ...real, ...mocks.dominio };
});

const form = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

/** Roda a ação e devolve o endereço para onde ela redirecionou. */
const destino = async (acao: (f: FormData) => Promise<unknown>, f: FormData) => {
  try {
    await acao(f);
  } catch (erro) {
    if (erro instanceof Redirecionou) return erro.url;
    throw erro;
  }
  throw new Error('a ação não redirecionou');
};

beforeEach(() => {
  mocks.curador.mockResolvedValue({ id: 'c1', papel: 'administrador' });
});
afterEach(() => {
  mocks.curador.mockReset();
  mocks.signIn.mockReset();
  mocks.signOut.mockReset();
  for (const fn of Object.values(mocks.dominio)) fn.mockReset();
});

describe('ações da pauta', () => {
  const carregar = () => import('./pautas/[id]/acoes');

  it('sem sessão, toda ação leva ao login e não toca o domínio', async () => {
    mocks.curador.mockResolvedValue(null);
    const a = await carregar();
    for (const acao of [
      a.atualizarUrgencia,
      a.recusarRelatoDeOrigem,
      a.definirCategoria,
      a.corrigirBloco,
      a.ajustarMeta,
    ]) {
      expect(await destino(acao, form({ pautaId: PAUTA }))).toBe('/login');
    }
    expect(mocks.dominio.marcarUrgencia).not.toHaveBeenCalled();
    expect(mocks.dominio.ajustarMeta).not.toHaveBeenCalled();
  });

  it('id de pauta que não é UUID volta para a fila', async () => {
    const a = await carregar();
    expect(await destino(a.atualizarUrgencia, form({ pautaId: 'x' }))).toBe('/fila');
    expect(await destino(a.definirCategoria, form({ pautaId: '' }))).toBe('/fila');
    expect(await destino(a.ajustarMeta, form({ pautaId: '1; drop' }))).toBe('/fila');
  });

  it('urgência: leva a caixa marcada e o motivo, e diz o que aconteceu', async () => {
    const a = await carregar();
    mocks.dominio.marcarUrgencia?.mockResolvedValue({ atualizada: true });
    expect(
      await destino(a.atualizarUrgencia, form({ pautaId: PAUTA, urgente: 'on', motivo: 'Risco.' })),
    ).toBe(`/pautas/${PAUTA}?feito=urgencia`);
    expect(mocks.dominio.marcarUrgencia).toHaveBeenCalledWith(
      {},
      { pautaId: PAUTA, curadorId: 'c1', urgente: true, motivo: 'Risco.' },
    );
    mocks.dominio.marcarUrgencia?.mockResolvedValue({ atualizada: false, motivo: 'sem_motivo' });
    expect(await destino(a.atualizarUrgencia, form({ pautaId: PAUTA }))).toBe(
      `/pautas/${PAUTA}?erro=sem_motivo`,
    );
    expect(mocks.dominio.marcarUrgencia).toHaveBeenLastCalledWith(
      {},
      { pautaId: PAUTA, curadorId: 'c1', urgente: false, motivo: '' },
    );
  });

  it('recusar o relato de origem: feito ou erro', async () => {
    const a = await carregar();
    mocks.dominio.recusarRelatoDeOrigem?.mockResolvedValue({ feito: true });
    expect(await destino(a.recusarRelatoDeOrigem, form({ pautaId: PAUTA }))).toBe(
      `/pautas/${PAUTA}?feito=relato_recusado`,
    );
    mocks.dominio.recusarRelatoDeOrigem?.mockResolvedValue({ feito: false, motivo: 'sem_relato' });
    expect(await destino(a.recusarRelatoDeOrigem, form({ pautaId: PAUTA }))).toBe(
      `/pautas/${PAUTA}?erro=sem_relato`,
    );
  });

  it('categoria: feita, pauta inexistente (fila) ou outro erro', async () => {
    const a = await carregar();
    mocks.dominio.definirCategoria?.mockResolvedValue({ feito: true });
    expect(await destino(a.definirCategoria, form({ pautaId: PAUTA, categoria: 'agua' }))).toBe(
      `/pautas/${PAUTA}?feito=categoria`,
    );
    expect(mocks.dominio.definirCategoria).toHaveBeenCalledWith(
      {},
      { pautaId: PAUTA, categoria: 'agua' },
    );
    mocks.dominio.definirCategoria?.mockResolvedValue({
      feito: false,
      motivo: 'pauta_inexistente',
    });
    expect(await destino(a.definirCategoria, form({ pautaId: PAUTA }))).toBe('/fila');
    mocks.dominio.definirCategoria?.mockResolvedValue({
      feito: false,
      motivo: 'categoria_invalida',
    });
    expect(await destino(a.definirCategoria, form({ pautaId: PAUTA }))).toBe(
      `/pautas/${PAUTA}?erro=categoria_invalida`,
    );
  });

  it('bloco: "Todo o campus" vira nulo, e motivo obrigatório vira o erro da tela', async () => {
    const a = await carregar();
    mocks.dominio.corrigirBloco?.mockResolvedValue({ feito: true });
    expect(await destino(a.corrigirBloco, form({ pautaId: PAUTA, blocoId: '', motivo: 'm' }))).toBe(
      `/pautas/${PAUTA}?feito=bloco`,
    );
    expect(mocks.dominio.corrigirBloco).toHaveBeenCalledWith(
      {},
      { pautaId: PAUTA, curadorId: 'c1', blocoId: null, motivo: 'm' },
    );
    mocks.dominio.corrigirBloco?.mockResolvedValue({ feito: false, motivo: 'motivo_obrigatorio' });
    expect(await destino(a.corrigirBloco, form({ pautaId: PAUTA, blocoId: 'b1' }))).toBe(
      `/pautas/${PAUTA}?erro=motivo_ajuste`,
    );
    mocks.dominio.corrigirBloco?.mockResolvedValue({ feito: false, motivo: 'bloco_inexistente' });
    expect(await destino(a.corrigirBloco, form({ pautaId: PAUTA, blocoId: 'b1' }))).toBe(
      `/pautas/${PAUTA}?erro=bloco_inexistente`,
    );
  });

  it('meta: leva o número, e motivo obrigatório vira o erro da tela', async () => {
    const a = await carregar();
    mocks.dominio.ajustarMeta?.mockResolvedValue({ feito: true });
    expect(await destino(a.ajustarMeta, form({ pautaId: PAUTA, meta: '120', motivo: 'm' }))).toBe(
      `/pautas/${PAUTA}?feito=meta`,
    );
    expect(mocks.dominio.ajustarMeta).toHaveBeenCalledWith(
      {},
      { pautaId: PAUTA, curadorId: 'c1', meta: 120, motivo: 'm' },
    );
    mocks.dominio.ajustarMeta?.mockResolvedValue({ feito: false, motivo: 'motivo_obrigatorio' });
    expect(await destino(a.ajustarMeta, form({ pautaId: PAUTA, meta: '120' }))).toBe(
      `/pautas/${PAUTA}?erro=motivo_ajuste`,
    );
    mocks.dominio.ajustarMeta?.mockResolvedValue({ feito: false, motivo: 'meta_invalida' });
    expect(await destino(a.ajustarMeta, form({ pautaId: PAUTA, meta: 'abc' }))).toBe(
      `/pautas/${PAUTA}?erro=meta_invalida`,
    );
    expect(mocks.dominio.ajustarMeta).toHaveBeenLastCalledWith(
      {},
      { pautaId: PAUTA, curadorId: 'c1', meta: Number.NaN, motivo: '' },
    );
  });

  it('aprovar e recusar sem sessão levam ao login', async () => {
    mocks.curador.mockResolvedValue(null);
    const a = await carregar();
    expect(await destino(a.aprovar, form({ pautaId: PAUTA }))).toBe('/login');
    expect(await destino(a.recusar, form({ pautaId: PAUTA }))).toBe('/login');
    expect(mocks.dominio.aprovarPauta).not.toHaveBeenCalled();
    expect(mocks.dominio.recusarPauta).not.toHaveBeenCalled();
  });
});

describe('ações de ajuste de prazo e promessa', () => {
  const carregar = () => import('./pautas/[id]/ajustes-de-prazo-acoes');

  it('sem sessão ou com pauta inválida, não chega ao domínio', async () => {
    const a = await carregar();
    mocks.curador.mockResolvedValue(null);
    expect(await destino(a.prorrogarPrazo, form({ pautaId: PAUTA }))).toBe('/login');
    mocks.curador.mockResolvedValue({ id: 'c1', papel: 'curador' });
    expect(await destino(a.corrigirProtocolo, form({ pautaId: 'x' }))).toBe('/fila');
    expect(mocks.dominio.registrarProrrogacao).not.toHaveBeenCalled();
  });

  it('prorrogar leva caminho, motivo e fonte, e redireciona ao feito ou ao erro', async () => {
    const a = await carregar();
    mocks.dominio.registrarProrrogacao?.mockResolvedValue({ feito: true });
    const campos = { pautaId: PAUTA, caminhoId: 'k1', motivo: 'm', fonte: 'f' };
    expect(await destino(a.prorrogarPrazo, form(campos))).toBe(
      `/pautas/${PAUTA}?feito=ajuste_prazo`,
    );
    expect(mocks.dominio.registrarProrrogacao).toHaveBeenCalledWith(
      {},
      { caminhoId: 'k1', pautaId: PAUTA, curadorId: 'c1', motivo: 'm', fonte: 'f' },
    );
    mocks.dominio.registrarProrrogacao?.mockResolvedValue({
      feito: false,
      motivo: 'ja_prorrogado',
    });
    expect(await destino(a.prorrogarPrazo, form(campos))).toBe(
      `/pautas/${PAUTA}?erro=ja_prorrogado`,
    );
  });

  it('corrigir o protocolo leva a data', async () => {
    const a = await carregar();
    mocks.dominio.corrigirDataDoProtocolo?.mockResolvedValue({ feito: true });
    await destino(
      a.corrigirProtocolo,
      form({ pautaId: PAUTA, caminhoId: 'k1', data: '2026-03-01' }),
    );
    expect(mocks.dominio.corrigirDataDoProtocolo).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ caminhoId: 'k1', data: '2026-03-01', curadorId: 'c1' }),
    );
  });

  it('remarcar a promessa leva a nova data e mostra o erro do domínio', async () => {
    const a = await carregar();
    mocks.dominio.remarcarDataPrometida?.mockResolvedValue({
      feito: false,
      motivo: 'data_no_passado',
    });
    expect(
      await destino(
        a.remarcarPromessa,
        form({ pautaId: PAUTA, promessaId: 'q1', dataEntrega: '2020-01-01' }),
      ),
    ).toBe(`/pautas/${PAUTA}?erro=data_no_passado`);
    expect(mocks.dominio.remarcarDataPrometida).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ promessaId: 'q1', dataEntrega: '2020-01-01' }),
    );
  });

  it('o resultado sem motivo cai em "entrada_invalida"', async () => {
    const a = await carregar();
    mocks.dominio.registrarProrrogacao?.mockResolvedValue({ feito: false });
    expect(await destino(a.prorrogarPrazo, form({ pautaId: PAUTA }))).toBe(
      `/pautas/${PAUTA}?erro=entrada_invalida`,
    );
  });

  it('registrar a promessa sem sessão leva ao login', async () => {
    mocks.curador.mockResolvedValue(null);
    const { registrar } = await import('./pautas/[id]/promessa/acoes');
    expect(await destino(registrar, form({ pautaId: PAUTA }))).toBe('/login');
    expect(mocks.dominio.registrarPromessa).not.toHaveBeenCalled();
  });
});

describe('ações de relatos, fotos, pedidos e curadores', () => {
  it('sem sessão, todas levam ao login e nada vai ao domínio', async () => {
    mocks.curador.mockResolvedValue(null);
    const relatos = await import('./relatos/acoes');
    const fotos = await import('./fotos/acoes');
    const pedidos = await import('./pedidos/acoes');
    const curadores = await import('./curadores/acoes');
    for (const acao of [
      relatos.aprovar,
      relatos.recusar,
      fotos.recusarFoto,
      pedidos.aprovarPedido,
      pedidos.recusarPedido,
      curadores.adicionar,
      curadores.desativar,
      curadores.reativar,
    ]) {
      expect(await destino(acao, form({}))).toBe('/login');
    }
    for (const fn of Object.values(mocks.dominio)) expect(fn).not.toHaveBeenCalled();
  });

  it('o papel do formulário de curadores chega ao domínio', async () => {
    mocks.dominio.adicionarCurador?.mockResolvedValue({ adicionado: true });
    const { adicionar } = await import('./curadores/acoes');
    await destino(
      adicionar,
      form({ email: 'a@b.test', nome: 'Ana', papel: 'administrador' }),
    ).catch(() => undefined);
    expect(mocks.dominio.adicionarCurador).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ email: 'a@b.test', papel: 'administrador' }),
    );
  });
});

describe('caminhos felizes das ações de relatos, fotos, pedidos, promessa e curadores', () => {
  const RELATO = '00000004-0000-4000-8000-0000000000aa';

  it('relato: aprovar entrega as fotos vistas ao domínio; sem a conferência marcada, nem chega a ele', async () => {
    const { aprovar, recusar } = await import('./relatos/acoes');
    mocks.dominio.aprovarRelato?.mockResolvedValue({ moderado: true });
    expect(await destino(aprovar, form({ relatoId: RELATO }))).toBe(
      '/relatos?erro=conferencia_pendente',
    );
    expect(mocks.dominio.aprovarRelato).not.toHaveBeenCalled();
    const marcado = form({ relatoId: RELATO, conferido: 'on' });
    marcado.append('fotoVista', 'f1');
    marcado.append('fotoVista', '');
    expect(await destino(aprovar, marcado)).toBe('/relatos?feito=aprovado');
    expect(mocks.dominio.aprovarRelato).toHaveBeenCalledWith(
      {},
      { relatoId: RELATO, curadorId: 'c1', fotosVistas: ['f1'] },
    );
    mocks.dominio.recusarRelato?.mockResolvedValue({
      moderado: false,
      motivo: 'relato_inexistente',
    });
    expect(await destino(recusar, form({ relatoId: RELATO }))).toBe('/relatos');
    expect(mocks.dominio.recusarRelato).toHaveBeenCalledWith(
      {},
      { relatoId: RELATO, curadorId: 'c1' },
    );
  });

  it('foto: leva o motivo e volta para a tela de origem, com o aviso', async () => {
    const { recusarFoto } = await import('./fotos/acoes');
    mocks.dominio.recusarFoto?.mockResolvedValue({ recusada: true });
    expect(
      await destino(recusarFoto, form({ fotoId: RELATO, motivo: 'Rosto.', voltar: '/relatos' })),
    ).toBe('/relatos?feito=foto_recusada');
    expect(mocks.dominio.recusarFoto).toHaveBeenCalledWith(
      {},
      { fotoId: RELATO, curadorId: 'c1', motivo: 'Rosto.' },
    );
    mocks.dominio.recusarFoto?.mockResolvedValue({ recusada: false, motivo: 'ja_recusada' });
    expect(
      await destino(recusarFoto, form({ fotoId: RELATO, motivo: 'x', voltar: '/relatos' })),
    ).toBe('/relatos?erro=foto_ja_recusada');
  });

  it('pedido de edição: aprovar leva o texto visto; recusar leva o motivo; ambos voltam à tela', async () => {
    const { aprovarPedido, recusarPedido } = await import('./pedidos/acoes');
    mocks.dominio.decidirPedidoDeEdicao?.mockResolvedValue({ decidido: true });
    expect(
      await destino(
        aprovarPedido,
        form({ pedidoId: RELATO, depoisVisto: 'Novo texto.', voltar: '/pedidos' }),
      ),
    ).toBe('/pedidos?feito=edicao_aprovada');
    expect(mocks.dominio.decidirPedidoDeEdicao).toHaveBeenLastCalledWith(
      {},
      { pedidoId: RELATO, curadorId: 'c1', decisao: 'aprovado', depoisVisto: 'Novo texto.' },
    );
    mocks.dominio.decidirPedidoDeEdicao?.mockResolvedValue({
      decidido: false,
      motivo: 'ja_decidido',
    });
    expect(
      await destino(
        recusarPedido,
        form({ pedidoId: RELATO, motivo: 'Não cabe.', voltar: '/pedidos' }),
      ),
    ).toBe('/pedidos?erro=edicao_ja_decidido');
    expect(mocks.dominio.decidirPedidoDeEdicao).toHaveBeenLastCalledWith(
      {},
      { pedidoId: RELATO, curadorId: 'c1', decisao: 'recusado', motivo: 'Não cabe.' },
    );
  });

  it('promessa: leva resumo, fonte e data, e diz quantos apoiadores foram avisados', async () => {
    const { registrar } = await import('./pautas/[id]/promessa/acoes');
    mocks.dominio.registrarPromessa?.mockResolvedValue({ avisados: 12 });
    const futuro = '2999-01-01';
    expect(
      await destino(
        registrar,
        form({ pautaId: PAUTA, resumo: ' Troca. ', fonte: ' Ofício ', dataEntrega: futuro }),
      ),
    ).toBe(`/pautas/${PAUTA}?feito=promessa&avisados=12`);
    expect(mocks.dominio.registrarPromessa).toHaveBeenCalledWith(
      {},
      {
        pautaId: PAUTA,
        registradaPor: 'c1',
        resumo: 'Troca.',
        fonte: 'Ofício',
        dataEntrega: futuro,
      },
    );
  });

  it('curadores: o administrador adiciona, desativa e reativa; o curador comum volta à raiz', async () => {
    const { adicionar, desativar, reativar } = await import('./curadores/acoes');
    mocks.dominio.adicionarCurador?.mockResolvedValue({ feito: true });
    mocks.dominio.desativarCurador?.mockResolvedValue({ feito: true });
    mocks.dominio.reativarCurador?.mockResolvedValue({ feito: false, motivo: 'inexistente' });
    expect(
      await destino(adicionar, form({ email: 'a@b.test', nome: 'Ana', papel: 'curador' })),
    ).toBe('/curadores?feito=adicionado');
    expect(await destino(desativar, form({ curadorId: RELATO }))).toBe(
      '/curadores?feito=desativado',
    );
    expect(mocks.dominio.desativarCurador).toHaveBeenCalledWith(expect.anything(), {
      autorId: 'c1',
      alvoId: RELATO,
    });
    expect(await destino(reativar, form({ curadorId: RELATO }))).toBe(
      '/curadores?erro=inexistente',
    );
    mocks.curador.mockResolvedValue({ id: 'c2', papel: 'curador' });
    expect(await destino(adicionar, form({ email: 'a@b.test' }))).toBe('/');
    expect(await destino(desativar, form({ curadorId: RELATO }))).toBe('/');
  });

  it('conquista: sem sessão leva ao login; pauta inválida volta para as pautas', async () => {
    const { salvarConquista } = await import('./pautas/[id]/conquista-acoes');
    mocks.curador.mockResolvedValue(null);
    expect(await destino(salvarConquista, form({ pautaId: PAUTA }))).toBe('/login');
    mocks.curador.mockResolvedValue({ id: 'c1', papel: 'curador' });
    expect(await destino(salvarConquista, form({ pautaId: 'x' }))).toMatch(/^\//);
    expect(await destino(salvarConquista, new FormData())).toMatch(/^\//);
  });
});

describe('entrar e sair', () => {
  it('entrar envia o e-mail ao provedor e volta para a raiz', async () => {
    const { entrar } = await import('./acoes');
    await entrar(form({ email: 'a@b.test' }));
    expect(mocks.signIn).toHaveBeenCalledWith('nodemailer', { email: 'a@b.test', redirectTo: '/' });
  });

  it('entrar sem e-mail manda texto vazio, nunca um valor que não é texto', async () => {
    const { entrar } = await import('./acoes');
    await entrar(new FormData());
    expect(mocks.signIn).toHaveBeenCalledWith('nodemailer', { email: '', redirectTo: '/' });
  });

  it('sair leva ao login', async () => {
    const { sair } = await import('./acoes');
    await sair();
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectTo: '/login' });
  });
});
