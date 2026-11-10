import { curadores, eq, verificacoesLogin, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { adaptador, curadorAtivo, curadorAtivoPorId, hmacDoEmail } from './acesso';
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

    expect(await curadorAtivoPorId(db, ana)).toEqual({ id: ana, nome: 'Ana' });
    expect(await curadorAtivoPorId(db, caio?.id ?? '')).toBeUndefined();
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
      identifier: 'ana@ufal.br',
      token: 'hash-vencido',
      expires: new Date(Date.now() - 60_000),
    });
    await a.createVerificationToken?.({
      identifier: 'ana@ufal.br',
      token: 'hash-novo',
      expires: new Date(Date.now() + 60_000),
    });

    const linhas = await db.select().from(verificacoesLogin);
    expect(linhas.map((l) => l.token)).toContain('hash-novo');
    expect(linhas.map((l) => l.token)).not.toContain('hash-vencido');
    expect(JSON.stringify(linhas)).not.toContain('ana@ufal.br');
    expect(linhas.find((l) => l.token === 'hash-novo')?.identificador).toBe(
      hmacDoEmail('ana@ufal.br', CHAVE),
    );
  });

  it('token de outro e-mail não serve', async () => {
    const a = adaptador(db, CHAVE);
    await a.createVerificationToken?.({
      identifier: 'ana@ufal.br',
      token: 'hash-2',
      expires: new Date(Date.now() + 60_000),
    });

    expect(
      await a.useVerificationToken?.({ identifier: 'intruso@ufal.br', token: 'hash-2' }),
    ).toBeNull();
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
