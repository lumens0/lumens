import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  curador: vi.fn(),
  enviar: vi.fn(),
  config: undefined as object | undefined,
}));

// O Auth.js do proxy: `auth(f)` devolve o próprio tratador, para o teste chamá-lo com um pedido.
vi.mock('next-auth', () => ({
  default: (config: object) => {
    mocks.config = config;
    return { auth: (tratador: unknown) => tratador };
  },
}));
vi.mock('./auth', () => ({
  curadorDaSessao: mocks.curador,
  handlers: { GET: 'get-do-auth', POST: 'post-do-auth' },
}));
vi.mock('@aws-sdk/client-s3', async (original) => {
  const real = await original<typeof import('@aws-sdk/client-s3')>();
  return {
    ...real,
    S3Client: class {
      constructor(readonly opcoes: Record<string, unknown>) {}
      send = mocks.enviar;
    },
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  mocks.curador.mockReset();
  mocks.enviar.mockReset();
});

describe('configuração da sessão', () => {
  it('a sessão é um JWT de 7 dias, com as páginas de entrada, de verificação e de erro', async () => {
    const { configBase } = await import('./auth.config');
    expect(configBase.session).toEqual({ strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 });
    expect(configBase.pages).toEqual({
      signIn: '/login',
      verifyRequest: '/login/verifique',
      error: '/login/erro',
    });
  });

  it('o id do curador (token.sub) vai para a sessão; sem ele, a sessão fica como estava', async () => {
    const { configBase } = await import('./auth.config');
    const { callbacks } = configBase;
    const comSub = callbacks.session({ session: { user: {} }, token: { sub: 'c1' } } as never);
    const semSub = callbacks.session({ session: { user: {} }, token: {} } as never);
    expect((comSub as { user: { id?: string } }).user.id).toBe('c1');
    expect((semSub as { user: { id?: string } }).user.id).toBeUndefined();
  });
});

describe('proxy (primeira barreira)', () => {
  type Req = { nextUrl: URL; auth: object | null };
  const pedido = (caminho: string, auth: object | null): Req => ({
    nextUrl: new URL(`http://painel.test${caminho}`),
    auth,
  });
  const carregar = async () => {
    const modulo = await import('./proxy');
    return modulo as unknown as { default: (req: Req) => Response; config: { matcher: string[] } };
  };

  it('sem sessão, a página vai para o login', async () => {
    const { default: proxy } = await carregar();
    const resposta = proxy(pedido('/pautas', null));
    expect(resposta.status).toBe(307);
    expect(resposta.headers.get('location')).toBe('http://painel.test/login');
  });

  it('sem sessão, a rota de arquivos da curadoria responde 401, e não redireciona', async () => {
    const { default: proxy } = await carregar();
    const resposta = proxy(pedido('/curadoria/arquivos/fotos/2026/11/x.jpg', null));
    expect(resposta.status).toBe(401);
  });

  it('com sessão, segue em frente', async () => {
    const { default: proxy } = await carregar();
    const resposta = proxy(pedido('/pautas', { user: { id: 'c1' } }));
    expect(resposta.headers.get('location')).toBeNull();
    expect(resposta.status).toBe(200);
  });

  it('a tela de entrada fica aberta sem sessão', async () => {
    const { default: proxy } = await carregar();
    expect(proxy(pedido('/login', null)).headers.get('location')).toBeNull();
  });

  it('o matcher deixa de fora o Auth.js, os arquivos do Next, o ícone e o logo', async () => {
    const { config } = await carregar();
    const regra = new RegExp(`^${config.matcher[0] ?? ''}$`);
    expect(regra.test('/pautas')).toBe(true);
    expect(regra.test('/api/auth/callback/nodemailer')).toBe(false);
    expect(regra.test('/_next/static/a.js')).toBe(false);
    expect(regra.test('/favicon.ico')).toBe(false);
    expect(regra.test('/lumens-marca.svg')).toBe(false);
  });

  it('o proxy lê só o JWT: a configuração entregue ao Auth.js não tem provedor nem banco', async () => {
    await carregar();
    expect((mocks.config as { providers: unknown[] }).providers).toEqual([]);
  });
});

describe('rota do Auth.js', () => {
  it('GET e POST são os do Auth.js', async () => {
    const rota = await import('./app/api/auth/[...nextauth]/route');
    expect(rota.GET).toBe('get-do-auth');
    expect(rota.POST).toBe('post-do-auth');
  });
});

describe('armazenamento das fotos', () => {
  it('usa o endpoint do emulador, com endereço por caminho, quando há S3_ENDPOINT', async () => {
    vi.stubEnv('S3_ENDPOINT', 'http://minio.test:9000');
    vi.stubEnv('AWS_REGION', 'sa-east-1');
    const { clienteS3 } = await import('./armazenamento');
    const cliente = clienteS3() as unknown as { opcoes: Record<string, unknown> };
    expect(cliente.opcoes).toEqual({
      region: 'sa-east-1',
      endpoint: 'http://minio.test:9000',
      forcePathStyle: true,
    });
  });

  it('região vazia no ambiente (AWS_REGION=) também cai em us-east-1', async () => {
    vi.stubEnv('S3_ENDPOINT', undefined);
    vi.stubEnv('AWS_REGION', '');
    const { clienteS3 } = await import('./armazenamento');
    const cliente = clienteS3() as unknown as { opcoes: Record<string, unknown> };
    expect(cliente.opcoes.region).toBe('us-east-1');
  });

  it('sem S3_ENDPOINT nem região, usa a nuvem e us-east-1; e reaproveita o mesmo cliente', async () => {
    vi.stubEnv('S3_ENDPOINT', undefined);
    vi.stubEnv('AWS_REGION', undefined);
    const { clienteS3 } = await import('./armazenamento');
    const cliente = clienteS3() as unknown as { opcoes: Record<string, unknown> };
    expect(cliente.opcoes).toEqual({ region: 'us-east-1' });
    expect(clienteS3()).toBe(clienteS3());
  });
});

describe('rota dos arquivos da curadoria', () => {
  beforeEach(() => {
    vi.stubEnv('S3_BUCKET_FOTOS', 'bucket-teste');
  });
  const chave = 'fotos/2026/11/0f1c2d3e-4a5b-4c6d-8e7f-0123456789ab.jpg';
  const pedir = async (partes: string[]) => {
    const { GET } = await import('./app/curadoria/arquivos/[...chave]/route');
    return GET(new Request('http://painel.test/x'), { params: Promise.resolve({ chave: partes }) });
  };

  it('sem curador ativo, nega o pedido sem consultar o bucket', async () => {
    mocks.curador.mockResolvedValue(undefined);
    expect((await pedir(chave.split('/'))).status).toBe(401);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it('com curador, entrega os bytes do arquivo do bucket configurado', async () => {
    mocks.curador.mockResolvedValue({ id: 'c1' });
    mocks.enviar.mockResolvedValue({
      Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([1, 2, 3])) },
    });
    const resposta = await pedir(chave.split('/'));
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('Content-Type')).toBe('image/jpeg');
    expect([...new Uint8Array(await resposta.arrayBuffer())]).toEqual([1, 2, 3]);
    const comando = mocks.enviar.mock.calls[0]?.[0] as { input: { Bucket: string; Key: string } };
    expect(comando.input).toEqual({ Bucket: 'bucket-teste', Key: chave });
  });

  it('chave que não existe no bucket dá 404; outro erro do bucket sobe', async () => {
    mocks.curador.mockResolvedValue({ id: 'c1' });
    const { NoSuchKey } = await import('@aws-sdk/client-s3');
    mocks.enviar.mockRejectedValueOnce(new NoSuchKey({ message: 'x', $metadata: {} }));
    expect((await pedir(chave.split('/'))).status).toBe(404);
    mocks.enviar.mockRejectedValueOnce(new Error('S3 fora do ar'));
    await expect(pedir(chave.split('/'))).rejects.toThrow('S3 fora do ar');
  });

  it('corpo vazio dá 404', async () => {
    mocks.curador.mockResolvedValue({ id: 'c1' });
    mocks.enviar.mockResolvedValue({});
    expect((await pedir(chave.split('/'))).status).toBe(404);
  });

  it('chave fora do formato dá 404 sem consultar o bucket', async () => {
    mocks.curador.mockResolvedValue({ id: 'c1' });
    expect((await pedir(['..', 'etc', 'passwd'])).status).toBe(404);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
});
