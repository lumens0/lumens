import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fabrica: undefined as undefined | (() => Record<string, unknown>),
  auth: vi.fn(),
  criarPool: vi.fn(),
  criarDb: vi.fn(),
  curadorAtivo: vi.fn(),
  curadorAtivoPorId: vi.fn(),
  adaptador: vi.fn(),
  provedor: vi.fn(),
  depois: vi.fn(),
  enviarEmail: vi.fn(),
  guardar: vi.fn(),
  enviar: vi.fn(),
}));

vi.mock('next-auth', () => ({
  default: (fabrica: () => Record<string, unknown>) => {
    mocks.fabrica = fabrica;
    return {
      handlers: { GET: 'get', POST: 'post' },
      auth: mocks.auth,
      signIn: 'si',
      signOut: 'so',
    };
  },
}));
vi.mock('next-auth/providers/nodemailer', () => ({
  default: (opcoes: Record<string, unknown>) => {
    mocks.provedor(opcoes);
    return { id: 'nodemailer', opcoes };
  },
}));
vi.mock('next/server', () => ({ after: mocks.depois }));
vi.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: mocks.enviarEmail }),
}));
vi.mock('@lumens/db', () => ({ criarPool: mocks.criarPool, criarDb: mocks.criarDb }));
vi.mock('./acesso', () => ({
  VALIDADE_DO_LINK_S: 900,
  adaptador: mocks.adaptador,
  curadorAtivo: mocks.curadorAtivo,
  curadorAtivoPorId: mocks.curadorAtivoPorId,
}));
vi.mock('./envio', () => ({
  criarEnvioDoLink: () => ({ guardar: mocks.guardar, enviar: mocks.enviar }),
}));

const CHAVE_A = Buffer.alloc(32, 1).toString('base64');
const CHAVE_B = Buffer.alloc(32, 2).toString('base64');
const AMBIENTE: Record<string, string> = {
  DATABASE_URL: 'postgres://banco.test/lumens',
  CHAVE_HMAC: CHAVE_A,
  CHAVE_CIFRA_PAINEL: CHAVE_B,
  AUTH_SECRET: 'segredo',
  EMAIL_HOST: 'smtp.test',
  EMAIL_PORT: '587',
  EMAIL_USUARIO: 'usuario',
  EMAIL_SENHA: 'senha',
  EMAIL_REMETENTE: 'painel@lumens.test',
};

beforeEach(() => {
  for (const [nome, valor] of Object.entries(AMBIENTE)) vi.stubEnv(nome, valor);
  mocks.criarPool.mockReturnValue('pool');
  mocks.criarDb.mockReturnValue('db');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  for (const fn of Object.values(mocks))
    if (typeof fn === 'function' && 'mockReset' in fn) fn.mockReset();
});

describe('servidor', () => {
  it('abre uma conexão só, no primeiro pedido, e a reaproveita', async () => {
    const { servidor } = await import('./auth');
    expect(mocks.criarPool).not.toHaveBeenCalled();
    const a = servidor();
    const b = servidor();
    expect(a).toBe(b);
    expect(a.db).toBe('db');
    expect(mocks.criarPool).toHaveBeenCalledTimes(1);
    expect(mocks.criarPool).toHaveBeenCalledWith(
      AMBIENTE.DATABASE_URL,
      { conexaoMs: 5000, consultaMs: 15_000 },
      expect.any(Function),
    );
    expect(a.chave.equals(Buffer.from(CHAVE_A, 'base64'))).toBe(true);
  });

  it('o aviso de queda da conexão vai para o log do servidor', async () => {
    const { servidor } = await import('./auth');
    servidor();
    const aviso = mocks.criarPool.mock.calls[0]?.[2] as (erro: Error) => void;
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    aviso(new Error('caiu'));
    expect(log).toHaveBeenCalledWith('Conexão do painel com o banco caiu:', 'caiu');
    log.mockRestore();
  });

  it('variável faltando diz qual é, para quem sobe o painel', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { servidor } = await import('./auth');
    expect(() => servidor()).toThrow('DATABASE_URL não configurada no ambiente do painel');
  });
});

describe('chavesDeCurador', () => {
  it('entrega a chave de cifra do painel e a do HMAC', async () => {
    const { chavesDeCurador } = await import('./auth');
    const chaves = chavesDeCurador();
    expect(chaves.cifra.equals(Buffer.from(CHAVE_B, 'base64'))).toBe(true);
    expect(chaves.hmac.equals(Buffer.from(CHAVE_A, 'base64'))).toBe(true);
  });

  it('recusa chave de cifra igual à do HMAC', async () => {
    vi.stubEnv('CHAVE_CIFRA_PAINEL', CHAVE_A);
    const { chavesDeCurador } = await import('./auth');
    expect(() => chavesDeCurador()).toThrow('diferente da CHAVE_HMAC');
  });

  it('recusa chave de cifra que não tem 32 bytes', async () => {
    vi.stubEnv('CHAVE_CIFRA_PAINEL', Buffer.alloc(16, 3).toString('base64'));
    const { chavesDeCurador } = await import('./auth');
    expect(() => chavesDeCurador()).toThrow('32 bytes');
  });

  it('sem a chave no ambiente, diz que falta', async () => {
    vi.stubEnv('CHAVE_CIFRA_PAINEL', '');
    const { chavesDeCurador } = await import('./auth');
    expect(() => chavesDeCurador()).toThrow('CHAVE_CIFRA_PAINEL não configurada');
  });
});

describe('curadorDaSessao', () => {
  it('sem sessão, não há curador e o banco nem é consultado', async () => {
    mocks.auth.mockResolvedValue(null);
    const { curadorDaSessao } = await import('./auth');
    expect(await curadorDaSessao()).toBeUndefined();
    expect(mocks.curadorAtivoPorId).not.toHaveBeenCalled();
  });

  it('com sessão, o curador é conferido no banco a cada pedido (um desativado não passa)', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'c1' } });
    mocks.curadorAtivoPorId.mockResolvedValue({ id: 'c1', nome: 'Ana', papel: 'curador' });
    const { curadorDaSessao } = await import('./auth');
    expect(await curadorDaSessao()).toEqual({ id: 'c1', nome: 'Ana', papel: 'curador' });
    expect(mocks.curadorAtivoPorId).toHaveBeenCalledWith('db', 'c1');
    mocks.curadorAtivoPorId.mockResolvedValue(undefined);
    expect(await curadorDaSessao()).toBeUndefined();
  });
});

describe('configuração do Auth.js do painel', () => {
  const montar = async () => {
    await import('./auth');
    const fabrica = mocks.fabrica;
    if (!fabrica) throw new Error('o Auth.js não recebeu a configuração');
    return fabrica() as {
      callbacks: {
        signIn: (a: {
          user: { email?: string };
          email?: { verificationRequest?: boolean };
        }) => Promise<unknown>;
        session: unknown;
      };
      providers: { opcoes: Record<string, unknown> }[];
      session: unknown;
    };
  };

  it('herda a base (JWT de 7 dias) e usa o e-mail como único provedor, com link de 15 minutos', async () => {
    const config = await montar();
    expect(config.session).toEqual({ strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 });
    expect(config.providers).toHaveLength(1);
    const opcoes = config.providers[0]?.opcoes;
    expect(opcoes?.from).toBe('painel@lumens.test');
    expect(opcoes?.maxAge).toBe(900);
    expect(opcoes?.secret).toBe('segredo');
    expect(opcoes?.server).toMatchObject({ host: 'smtp.test' });
  });

  it('curador ativo entra', async () => {
    mocks.curadorAtivo.mockResolvedValue({ id: 'c1' });
    const { callbacks } = await montar();
    expect(await callbacks.signIn({ user: { email: 'a@b.test' } })).toBe(true);
    expect(mocks.curadorAtivo).toHaveBeenCalledWith('db', 'a@b.test', expect.any(Buffer));
  });

  it('quem não é curador vê a mesma tela de "confira seu e-mail", sem receber nada', async () => {
    mocks.curadorAtivo.mockResolvedValue(undefined);
    const { callbacks } = await montar();
    expect(
      await callbacks.signIn({ user: { email: 'x@b.test' }, email: { verificationRequest: true } }),
    ).toBe('/api/auth/verify-request?provider=nodemailer&type=email');
  });

  it('no clique no link, um curador desativado nesse meio-tempo não entra', async () => {
    mocks.curadorAtivo.mockResolvedValue(undefined);
    const { callbacks } = await montar();
    expect(await callbacks.signIn({ user: { email: 'a@b.test' } })).toBe(false);
  });

  it('usuário sem e-mail nunca entra, e o banco nem é consultado', async () => {
    const { callbacks } = await montar();
    expect(await callbacks.signIn({ user: {} })).toBe(false);
    expect(mocks.curadorAtivo).not.toHaveBeenCalled();
  });

  it('o e-mail sai depois da resposta, para o pedido de quem é curador não demorar mais', async () => {
    await montar();
    const { sendVerificationRequest } = mocks.provedor.mock.calls[0]?.[0] as {
      sendVerificationRequest: (a: object) => void;
    };
    sendVerificationRequest({
      identifier: 'a@b.test',
      url: 'https://painel.test/x',
      provider: { from: 'painel@lumens.test' },
      token: 't',
    });
    expect(mocks.depois).toHaveBeenCalledTimes(1);
    const tarefa = mocks.depois.mock.calls[0]?.[0] as () => unknown;
    tarefa();
    expect(mocks.enviar).toHaveBeenCalledWith({
      identifier: 'a@b.test',
      url: 'https://painel.test/x',
      from: 'painel@lumens.test',
      token: 't',
    });
  });

  it('o adaptador guarda o token e mantém o processo vivo até a gravação acabar, mesmo que falhe', async () => {
    mocks.guardar.mockReturnValue(Promise.reject(new Error('banco fora')));
    await montar();
    const guardarToken = mocks.adaptador.mock.calls[0]?.[2] as (t: string, g: unknown) => void;
    guardarToken('hash', { expires: new Date() });
    expect(mocks.guardar).toHaveBeenCalledWith('hash', expect.anything());
    const espera = mocks.depois.mock.calls[0]?.[0] as () => Promise<void>;
    await expect(espera()).resolves.toBeUndefined();
  });
});
