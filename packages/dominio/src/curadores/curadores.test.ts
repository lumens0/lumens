import { createDecipheriv } from 'node:crypto';
import { curadorAuditoria, curadores, eq, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  adicionarCurador,
  desativarCurador,
  hmacDoEmailDeCurador,
  listarCuradores,
  reativarCurador,
  type ChavesDeCurador,
} from './curadores';

const chaves: ChavesDeCurador = { cifra: Buffer.alloc(32, 1), hmac: Buffer.alloc(32, 2) };
let db: Db;
let sequencia = 0;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
}, 30_000);

/** Um administrador novo, criado como o script cria o primeiro. */
async function administrador(): Promise<string> {
  const n = ++sequencia;
  const r = await adicionarCurador(db, chaves, {
    email: `admin${String(n)}@ufal.br`,
    nome: `Admin ${String(n)}`,
    papel: 'administrador',
  });
  if (!r.feito) throw new Error('fixture não criou o administrador');
  return r.curadorId;
}

async function auditoriaDe(alvoId: string) {
  return db
    .select({ acao: curadorAuditoria.acao, autorId: curadorAuditoria.autorId })
    .from(curadorAuditoria)
    .where(eq(curadorAuditoria.alvoId, alvoId));
}

describe('adicionarCurador', () => {
  it('grava e-mail cifrado e com HMAC, e registra a auditoria', async () => {
    const autor = await administrador();

    const r = await adicionarCurador(db, chaves, {
      autorId: autor,
      email: '  Fulana@UFAL.br ',
      nome: ' Fulana ',
    });

    if (!r.feito) throw new Error('esperava sucesso');
    const [linha] = await db.select().from(curadores).where(eq(curadores.id, r.curadorId));
    expect(linha).toMatchObject({
      emailHmac: hmacDoEmailDeCurador('fulana@ufal.br', chaves.hmac),
      nome: 'Fulana',
      papel: 'curador',
      ativo: true,
    });
    expect(linha?.emailCifrado).not.toContain('fulana');
    // iv (12) | tag (16) | texto: decifra com a chave de cifra e dá o e-mail normalizado.
    const bytes = Buffer.from(linha?.emailCifrado ?? '', 'base64');
    const decifra = createDecipheriv('aes-256-gcm', chaves.cifra, bytes.subarray(0, 12));
    decifra.setAuthTag(bytes.subarray(12, 28));
    expect(Buffer.concat([decifra.update(bytes.subarray(28)), decifra.final()]).toString()).toBe(
      'fulana@ufal.br',
    );
    expect(await auditoriaDe(r.curadorId)).toEqual([{ acao: 'adicionou', autorId: autor }]);
  });

  it('sem autor (primeiro administrador), a pessoa consta como autora da própria entrada', async () => {
    const id = await administrador();

    expect(await auditoriaDe(id)).toEqual([{ acao: 'adicionou', autorId: id }]);
    expect((await listarCuradores(db, chaves)).find((c) => c.id === id)?.papel).toBe(
      'administrador',
    );
  });

  it.each([
    'fulana@gmail.com',
    'fulana@ufal.br.exemplo.com',
    'fulana@alunos.ufal.br',
    'sem-arroba',
  ])('recusa %s, que não é e-mail @ufal.br', async (email) => {
    const r = await adicionarCurador(db, chaves, { email, nome: 'Fulana' });

    expect(r).toEqual({ feito: false, motivo: 'email_invalido' });
  });

  it('recusa nome vazio', async () => {
    const r = await adicionarCurador(db, chaves, { email: 'vazio@ufal.br', nome: '  ' });

    expect(r).toEqual({ feito: false, motivo: 'nome_obrigatorio' });
  });

  it('não duplica: quem já está ativo é recusado e quem foi desativado volta', async () => {
    const autor = await administrador();
    const primeira = await adicionarCurador(db, chaves, {
      autorId: autor,
      email: 'volta@ufal.br',
      nome: 'Volta',
    });
    if (!primeira.feito) throw new Error('esperava sucesso');

    expect(
      await adicionarCurador(db, chaves, { autorId: autor, email: 'volta@ufal.br', nome: 'Volta' }),
    ).toEqual({ feito: false, motivo: 'ja_ativo' });

    await desativarCurador(db, { autorId: autor, alvoId: primeira.curadorId });
    const segunda = await adicionarCurador(db, chaves, {
      autorId: autor,
      email: 'VOLTA@ufal.br',
      nome: 'Volta',
    });

    expect(segunda).toEqual({ feito: true, curadorId: primeira.curadorId });
    const todos = await listarCuradores(db, chaves);
    expect(todos.filter((c) => c.email === 'volta@ufal.br')).toHaveLength(1);
    expect((await auditoriaDe(primeira.curadorId)).map((a) => a.acao)).toEqual([
      'adicionou',
      'desativou',
      'reativou',
    ]);
  });
});

describe('desativarCurador e reativarCurador', () => {
  it('desativa e reativa, auditando as duas', async () => {
    const autor = await administrador();
    const r = await adicionarCurador(db, chaves, {
      autorId: autor,
      email: 'alterna@ufal.br',
      nome: 'Alterna',
    });
    if (!r.feito) throw new Error('esperava sucesso');

    expect(await desativarCurador(db, { autorId: autor, alvoId: r.curadorId })).toEqual(r);
    expect(await desativarCurador(db, { autorId: autor, alvoId: r.curadorId })).toEqual({
      feito: false,
      motivo: 'ja_inativo',
    });
    expect(await reativarCurador(db, { autorId: autor, alvoId: r.curadorId })).toEqual(r);
    expect(await reativarCurador(db, { autorId: autor, alvoId: r.curadorId })).toEqual({
      feito: false,
      motivo: 'ja_ativo',
    });
    expect((await auditoriaDe(r.curadorId)).map((a) => a.acao)).toEqual([
      'adicionou',
      'desativou',
      'reativou',
    ]);
  });

  it('ninguém desativa a si mesmo', async () => {
    const autor = await administrador();

    expect(await desativarCurador(db, { autorId: autor, alvoId: autor })).toEqual({
      feito: false,
      motivo: 'proprio_curador',
    });
    const [linha] = await db.select().from(curadores).where(eq(curadores.id, autor));
    expect(linha?.ativo).toBe(true);
  });

  it('não desativa o último administrador ativo, mas desativa quando há outro', async () => {
    // O banco é compartilhado entre os testes: zera os outros administradores para isolar o caso.
    await db.update(curadores).set({ ativo: false });
    const unico = await administrador();
    const comum = await adicionarCurador(db, chaves, {
      autorId: unico,
      email: 'comum@ufal.br',
      nome: 'Comum',
    });
    if (!comum.feito) throw new Error('esperava sucesso');

    // Um curador comum (que a tela nem deixaria chegar aqui) tentando tirar o único administrador.
    expect(await desativarCurador(db, { autorId: comum.curadorId, alvoId: unico })).toEqual({
      feito: false,
      motivo: 'ultimo_administrador',
    });

    const outro = await administrador();
    expect(await desativarCurador(db, { autorId: outro, alvoId: unico })).toEqual({
      feito: true,
      curadorId: unico,
    });
  });

  it('recusa curador que não existe', async () => {
    const autor = await administrador();
    const semLinha = '00000000-0000-4000-8000-000000000000';

    expect(await desativarCurador(db, { autorId: autor, alvoId: semLinha })).toEqual({
      feito: false,
      motivo: 'inexistente',
    });
    expect(await reativarCurador(db, { autorId: autor, alvoId: semLinha })).toEqual({
      feito: false,
      motivo: 'inexistente',
    });
  });
});

describe('adicionarCurador ao mesmo tempo', () => {
  it('dois cadastros do mesmo e-mail juntos: um adiciona, o outro responde já ativo', async () => {
    const autor = await administrador();
    const pedido = () =>
      adicionarCurador(db, chaves, { autorId: autor, email: 'duas.vezes@ufal.br', nome: 'Dupla' });

    const resultados = await Promise.all([pedido(), pedido()]);

    expect(resultados.filter((r) => r.feito)).toHaveLength(1);
    expect(resultados.filter((r) => !r.feito)).toEqual([{ feito: false, motivo: 'ja_ativo' }]);
    const linhas = await db
      .select({ id: curadores.id })
      .from(curadores)
      .where(eq(curadores.emailHmac, hmacDoEmailDeCurador('duas.vezes@ufal.br', chaves.hmac)));
    expect(linhas).toHaveLength(1);
    expect(await auditoriaDe(linhas[0]?.id ?? '')).toHaveLength(1);
  });
});

describe('listarCuradores', () => {
  it('traz o e-mail decifrado, ativos primeiro', async () => {
    const autor = await administrador();
    const a = await adicionarCurador(db, chaves, {
      autorId: autor,
      email: 'zeca@ufal.br',
      nome: 'Zeca',
    });
    if (!a.feito) throw new Error('esperava sucesso');
    await desativarCurador(db, { autorId: autor, alvoId: a.curadorId });

    const lista = await listarCuradores(db, chaves);

    expect(lista.find((c) => c.id === a.curadorId)).toMatchObject({
      email: 'zeca@ufal.br',
      ativo: false,
    });
    const primeiroInativo = lista.findIndex((c) => !c.ativo);
    expect(lista.slice(primeiroInativo).every((c) => !c.ativo)).toBe(true);
  });
  it('e-mail que não abre com a chave atual (o do seed) não derruba a lista', async () => {
    // Como o seed grava os curadores fictícios (`placeholderCifrado` em packages/db/seed/data.ts).
    const [doSeed] = await db
      .insert(curadores)
      .values({
        emailHmac: 'hmac-do-seed',
        emailCifrado: `seed:v1:email:${Buffer.from('ana.curadoria@seed.invalid').toString('base64url')}`,
        nome: 'Ana Curadoria',
      })
      .returning({ id: curadores.id });

    const lista = await listarCuradores(db, chaves);

    expect(lista.find((c) => c.id === doSeed?.id)?.email).toBe('E-mail indisponível');
  });
});
