import { curadores, eq, pedidosLinkLogin, verificacoesLogin, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  VALIDADE_DO_LINK_S,
  adaptador,
  curadorAtivo,
  curadorAtivoPorId,
  hmacDoEmail,
  reservarEnvio,
} from './acesso';
import { destino } from './destino';

const CHAVE = Buffer.alloc(32, 7);
let db: Db;
let ana: string;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
  const linhas = await db
    .insert(curadores)
    .values([
      { emailHmac: hmacDoEmail('ana@ufal.br', CHAVE), emailCifrado: 'x', nome: 'Ana' },
      { emailHmac: hmacDoEmail('caio@ufal.br', CHAVE), emailCifrado: 'x', nome: 'Caio' },
    ])
    .returning({ id: curadores.id, nome: curadores.nome });
  ana = linhas.find((l) => l.nome === 'Ana')?.id ?? '';
  await db.update(curadores).set({ ativo: false }).where(eq(curadores.nome, 'Caio'));
}, 30_000);

describe('quem entra no painel', () => {
  it('curador ativo entra, com o e-mail em qualquer caixa e com espaços', async () => {
    expect(await curadorAtivo(db, '  Ana@UFAL.br ', CHAVE)).toEqual({ id: ana, nome: 'Ana' });
    // O login não precisa do papel: ele é lido a cada pedido, em `curadorAtivoPorId`.
  });

  it('e-mail fora da lista e curador desativado não entram', async () => {
    expect(await curadorAtivo(db, 'intruso@ufal.br', CHAVE)).toBeUndefined();
    expect(await curadorAtivo(db, 'caio@ufal.br', CHAVE)).toBeUndefined();
  });

  it('sessão de curador desativado deixa de valer no pedido seguinte', async () => {
    const [caio] = await db
      .select({ id: curadores.id })
      .from(curadores)
      .where(eq(curadores.nome, 'Caio'));

    expect(await curadorAtivoPorId(db, ana)).toEqual({ id: ana, nome: 'Ana', papel: 'curador' });
    expect(await curadorAtivoPorId(db, caio?.id ?? '')).toBeUndefined();
  });

  it('a sessão traz o papel de agora, lido do banco a cada pedido', async () => {
    await db.update(curadores).set({ papel: 'administrador' }).where(eq(curadores.id, ana));
    expect(await curadorAtivoPorId(db, ana)).toMatchObject({ papel: 'administrador' });

    await db.update(curadores).set({ papel: 'curador' }).where(eq(curadores.id, ana));
    expect(await curadorAtivoPorId(db, ana)).toMatchObject({ papel: 'curador' });
  });

  it('o adapter não conhece quem está fora da lista nem cria ninguém', async () => {
    const a = adaptador(db, CHAVE);

    expect(await a.getUserByEmail?.('intruso@ufal.br')).toBeNull();
    expect(await a.getUserByEmail?.('ana@ufal.br')).toMatchObject({ id: ana, name: 'Ana' });
    // No clique do link vem só o id; o nome da sessão sai do banco.
    expect(await a.updateUser?.({ id: ana, emailVerified: new Date() })).toMatchObject({
      id: ana,
      name: 'Ana',
    });
    expect(() =>
      a.createUser?.({ id: 'x', email: 'intruso@ufal.br', emailVerified: null }),
    ).toThrow();
  });
});

describe('link de acesso', () => {
  it('vale uma vez só', async () => {
    const a = adaptador(db, CHAVE);
    const expires = new Date(Date.now() + 15 * 60_000);
    await a.createVerificationToken?.({ identifier: 'ana@ufal.br', token: 'hash-1', expires });

    expect(await a.useVerificationToken?.({ identifier: 'ana@ufal.br', token: 'hash-1' })).toEqual({
      identifier: 'ana@ufal.br',
      token: 'hash-1',
      expires,
    });
    expect(
      await a.useVerificationToken?.({ identifier: 'ana@ufal.br', token: 'hash-1' }),
    ).toBeNull();
  });

  it('a tabela guarda o HMAC do e-mail, não o e-mail, e pedir um link novo leva os vencidos', async () => {
    const a = adaptador(db, CHAVE);
    await a.createVerificationToken?.({
      identifier: 'vencido@ufal.br',
      token: 'hash-vencido',
      expires: new Date(Date.now() - 60_000),
    });
    await a.createVerificationToken?.({
      identifier: 'novo@ufal.br',
      token: 'hash-novo',
      expires: new Date(Date.now() + 60_000),
    });

    const linhas = await db.select().from(verificacoesLogin);
    expect(linhas.map((l) => l.token)).toContain('hash-novo');
    expect(linhas.map((l) => l.token)).not.toContain('hash-vencido');
    expect(JSON.stringify(linhas)).not.toContain('novo@ufal.br');
    expect(linhas.find((l) => l.token === 'hash-novo')?.identificador).toBe(
      hmacDoEmail('novo@ufal.br', CHAVE),
    );
  });

  it('token de outro e-mail não serve', async () => {
    const a = adaptador(db, CHAVE);
    await a.createVerificationToken?.({
      identifier: 'dois@ufal.br',
      token: 'hash-2',
      expires: new Date(Date.now() + 60_000),
    });

    expect(
      await a.useVerificationToken?.({ identifier: 'intruso@ufal.br', token: 'hash-2' }),
    ).toBeNull();
  });
});

describe('limite de um link por minuto (SCRUM-305)', () => {
  const link = (email: string, token: string) => ({
    identifier: email,
    token,
    expires: new Date(Date.now() + VALIDADE_DO_LINK_S * 1000),
  });

  it('o segundo pedido logo depois não grava link nem libera envio; passados 60 s, libera', async () => {
    const t = new Date('2026-11-18T12:00:00.000Z');
    expect(await reservarEnvio(db, 'Janela@ufal.br ', CHAVE, t)).toBe(true);
    expect(await reservarEnvio(db, 'janela@ufal.br', CHAVE, new Date(t.getTime() + 59_000))).toBe(
      false,
    );
    expect(await reservarEnvio(db, 'janela@ufal.br', CHAVE, new Date(t.getTime() + 60_000))).toBe(
      true,
    );
  });

  it('pedidos simultâneos do mesmo e-mail: só um passa', async () => {
    const t = new Date('2026-11-18T13:00:00.000Z');
    const r = await Promise.all(
      Array.from({ length: 8 }, () => reservarEnvio(db, 'simultaneo@ufal.br', CHAVE, t)),
    );
    expect(r.filter(Boolean)).toHaveLength(1);
  });

  it('com `depois`, dois createVerificationToken simultâneos gravam um link só', async () => {
    const gravacoes: Promise<boolean>[] = [];
    const a = adaptador(db, CHAVE, (_id, g) => gravacoes.push(g));
    await Promise.all([
      a.createVerificationToken?.(link('conc@ufal.br', 't1')),
      a.createVerificationToken?.(link('conc@ufal.br', 't2')),
    ]);
    const resultados = await Promise.all(gravacoes);
    expect(resultados.filter(Boolean)).toHaveLength(1);
    const linhas = await db.select().from(verificacoesLogin);
    expect(
      linhas.filter((l) => l.identificador === hmacDoEmail('conc@ufal.br', CHAVE)),
    ).toHaveLength(1);
  });

  it('usar o primeiro link não libera um segundo pedido dentro do mesmo minuto', async () => {
    const a = adaptador(db, CHAVE);
    await a.createVerificationToken?.(link('usado@ufal.br', 'primeiro'));
    expect(
      await a.useVerificationToken?.({ identifier: 'usado@ufal.br', token: 'primeiro' }),
    ).not.toBeNull();

    await a.createVerificationToken?.(link('usado@ufal.br', 'segundo'));
    const linhas = await db.select().from(verificacoesLogin);
    expect(linhas.map((l) => l.token)).not.toContain('segundo');
  });

  it('o registro do último envio guarda só o HMAC e linhas de mais de um dia são apagadas', async () => {
    const velho = new Date('2026-01-01T00:00:00.000Z');
    await reservarEnvio(db, 'velho@ufal.br', CHAVE, velho);
    await reservarEnvio(db, 'outro@ufal.br', CHAVE, new Date('2026-11-19T12:00:00.000Z'));

    const linhas = await db.select().from(pedidosLinkLogin);
    expect(JSON.stringify(linhas)).not.toContain('@ufal.br');
    expect(linhas.map((l) => l.identificador)).not.toContain(hmacDoEmail('velho@ufal.br', CHAVE));
  });
});

describe('destino no proxy', () => {
  it.each([
    ['/', false, 'login'],
    ['/pautas', false, 'login'],
    ['/curadoria/pautas/1/eventos', false, 'nao_autorizado'],
    ['/login', false, 'segue'],
    ['/login/verifique', false, 'segue'],
    ['/login/erro', false, 'segue'],
    ['/loginx', false, 'login'],
    ['/', true, 'segue'],
    ['/curadoria/pautas/1/eventos', true, 'segue'],
  ] as const)('%s logado=%s → %s', (caminho, logado, esperado) => {
    expect(destino(caminho, logado)).toBe(esperado);
  });
});
