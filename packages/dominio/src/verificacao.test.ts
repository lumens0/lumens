import { codigosVerificacao, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CODIGO_EXPIRA_MS,
  EMAIL_MAXIMO,
  MAX_TENTATIVAS,
  REENVIO_APOS_MS,
  apagarCodigo,
  conferirCodigo,
  emailInstitucional,
  esperaParaReenviar,
  gerarCodigo,
  guardarCodigo,
  hashDoCodigo,
  normalizarEmail,
} from './verificacao';

describe('emailInstitucional', () => {
  it.each([
    ['aluno@ufal.br', 'aluno@ufal.br'],
    ['joao.silva@ic.ufal.br', 'joao.silva@ic.ufal.br'],
    ['maria@ctec.ufal.br', 'maria@ctec.ufal.br'],
    ['ana@campus.arapiraca.ufal.br', 'ana@campus.arapiraca.ufal.br'],
    ['  Aluno@UFAL.BR  ', 'aluno@ufal.br'],
    ['meu e-mail é joao@ic.ufal.br.', 'joao@ic.ufal.br'],
    ['<aluno@ufal.br>', 'aluno@ufal.br'],
    ['(aluno@ufal.br)', 'aluno@ufal.br'],
    ['mailto:aluno@ufal.br', 'aluno@ufal.br'],
    ['nome+lumens@ufal.br', 'nome+lumens@ufal.br'],
  ])('aceita %j como %s', (mensagem, email) => {
    expect(emailInstitucional(mensagem)).toEqual({ valido: true, email });
  });

  it.each([
    ['aluno@gmail.com'],
    ['aluno@ufal.com'],
    ['aluno@ufal.br.com'],
    ['aluno@xufal.br'],
    ['aluno@ufpe.br'],
    ['aluno@ufal.br.evil.com'],
    ['aluno@ic-ufal.br'],
    ['aluno@.ufal.br'],
    ['aluno@ic..ufal.br'],
    ['aluno@-ic.ufal.br'],
  ])('recusa %j por estar fora da UFAL', (mensagem) => {
    expect(emailInstitucional(mensagem)).toEqual({ valido: false, motivo: 'fora_da_ufal' });
  });

  it.each([['oi'], ['ufal.br'], [''], ['   ']])('sem @ em %j não tem e-mail', (mensagem) => {
    expect(emailInstitucional(mensagem)).toEqual({ valido: false, motivo: 'sem_email' });
  });

  it.each([
    ['@ufal.br'],
    ['aluno@'],
    ['aluno@@ufal.br'],
    ['a@b@ufal.br'],
    ['aluno..x@ufal.br'],
    ['.aluno@ufal.br'],
    ['aluno@localhost'],
  ])('recusa %j pelo formato', (mensagem) => {
    expect(emailInstitucional(mensagem)).toEqual({ valido: false, motivo: 'formato' });
  });

  it('recusa endereço maior que o limite', () => {
    const longo = `${'a'.repeat(EMAIL_MAXIMO)}@ufal.br`;
    expect(emailInstitucional(longo)).toEqual({ valido: false, motivo: 'formato' });
  });

  it('com dois endereços, não escolhe: pede um só', () => {
    expect(emailInstitucional('aluno@ufal.br ou aluno@gmail.com')).toEqual({
      valido: false,
      motivo: 'varios_emails',
    });
  });
});

describe('normalizarEmail', () => {
  it('tira espaços das pontas e passa para minúsculas', () => {
    expect(normalizarEmail('  Joao.Silva@IC.Ufal.BR ')).toBe('joao.silva@ic.ufal.br');
  });
});

describe('gerarCodigo', () => {
  it('sempre tem 6 dígitos, com zeros à esquerda quando precisa', () => {
    const codigos = Array.from({ length: 2000 }, gerarCodigo);
    for (const codigo of codigos) expect(codigo).toMatch(/^\d{6}$/);
    // 2000 sorteios entre 1 milhão: quase todos diferentes. Um gerador quebrado repetiria.
    expect(new Set(codigos).size).toBeGreaterThan(1990);
  });
});

describe('hashDoCodigo', () => {
  it('é SHA-256 em hexadecimal e não contém o código', () => {
    const hash = hashDoCodigo('telefone-a', '012345');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('012345');
    expect(hashDoCodigo('telefone-a', '012345')).toBe(hash);
  });

  it('o mesmo código em outro telefone dá outro hash', () => {
    expect(hashDoCodigo('telefone-a', '012345')).not.toBe(hashDoCodigo('telefone-b', '012345'));
  });
});

describe('guardarCodigo', () => {
  let db: Db;
  beforeAll(async () => {
    db = await criarBancoEmMemoria();
  }, 60_000);

  const linhaDe = async (telefoneHmac: string) =>
    (await db.select().from(codigosVerificacao)).find((l) => l.telefoneHmac === telefoneHmac);

  it('guarda o hash, válido por 10 minutos, com as tentativas zeradas', async () => {
    const agora = new Date('2026-11-10T12:00:00Z');
    const { expiraEm } = await guardarCodigo(db, {
      telefoneHmac: 'tel-1',
      codigo: '123456',
      agora,
    });

    expect(expiraEm).toEqual(new Date(agora.getTime() + CODIGO_EXPIRA_MS));
    expect(await linhaDe('tel-1')).toEqual({
      telefoneHmac: 'tel-1',
      codigoHash: hashDoCodigo('tel-1', '123456'),
      expiraEm: new Date('2026-11-10T12:10:00Z'),
      tentativas: 0,
    });
  });

  it('código novo para o mesmo telefone substitui o anterior e zera as tentativas', async () => {
    await guardarCodigo(db, { telefoneHmac: 'tel-2', codigo: '111111' });
    await db.update(codigosVerificacao).set({ tentativas: 3 });
    const agora = new Date('2026-11-10T15:00:00Z');
    await guardarCodigo(db, { telefoneHmac: 'tel-2', codigo: '222222', agora });

    const linha = await linhaDe('tel-2');
    expect(linha?.codigoHash).toBe(hashDoCodigo('tel-2', '222222'));
    expect(linha?.tentativas).toBe(0);
    expect(linha?.expiraEm).toEqual(new Date('2026-11-10T15:10:00Z'));
    expect(
      (await db.select().from(codigosVerificacao)).filter((l) => l.telefoneHmac === 'tel-2'),
    ).toHaveLength(1);
  });
});

describe('conferirCodigo e reenvio (SCRUM-136)', () => {
  let db: Db;
  beforeAll(async () => {
    db = await criarBancoEmMemoria();
  }, 60_000);

  const ENVIO = new Date('2026-11-10T12:00:00Z');
  const depois = (ms: number) => new Date(ENVIO.getTime() + ms);
  const linhaDe = async (telefoneHmac: string) =>
    (await db.select().from(codigosVerificacao)).find((l) => l.telefoneHmac === telefoneHmac);

  it('código certo: confere e apaga, porque vale uma vez só', async () => {
    await guardarCodigo(db, { telefoneHmac: 'c-1', codigo: '123456', agora: ENVIO });
    expect(
      await conferirCodigo(db, { telefoneHmac: 'c-1', codigo: '123456', agora: depois(1000) }),
    ).toEqual({ certo: true });
    expect(await linhaDe('c-1')).toBeUndefined();
    expect(
      await conferirCodigo(db, { telefoneHmac: 'c-1', codigo: '123456', agora: depois(2000) }),
    ).toEqual({ certo: false, motivo: 'sem_codigo' });
  });

  it('cada erro gasta uma tentativa; na quinta, acabam, e nem o certo vale mais', async () => {
    await guardarCodigo(db, { telefoneHmac: 'c-2', codigo: '123456', agora: ENVIO });
    for (let erro = 1; erro <= MAX_TENTATIVAS; erro++) {
      expect(
        await conferirCodigo(db, { telefoneHmac: 'c-2', codigo: '000000', agora: depois(1000) }),
      ).toEqual({ certo: false, motivo: 'errado', restantes: MAX_TENTATIVAS - erro });
    }
    expect((await linhaDe('c-2'))?.tentativas).toBe(MAX_TENTATIVAS);
    expect(
      await conferirCodigo(db, { telefoneHmac: 'c-2', codigo: '123456', agora: depois(1000) }),
    ).toEqual({ certo: false, motivo: 'sem_tentativas' });
    expect((await linhaDe('c-2'))?.tentativas).toBe(MAX_TENTATIVAS);
  });

  it('depois de 10 minutos o código vence, mesmo certo, e não gasta tentativa', async () => {
    await guardarCodigo(db, { telefoneHmac: 'c-3', codigo: '123456', agora: ENVIO });
    expect(
      await conferirCodigo(db, {
        telefoneHmac: 'c-3',
        codigo: '123456',
        agora: depois(CODIGO_EXPIRA_MS),
      }),
    ).toEqual({ certo: false, motivo: 'expirado' });
    expect((await linhaDe('c-3'))?.tentativas).toBe(0);
    expect(
      await conferirCodigo(db, {
        telefoneHmac: 'c-3',
        codigo: '123456',
        agora: depois(CODIGO_EXPIRA_MS - 1),
      }),
    ).toEqual({ certo: true });
  });

  it('o código de um telefone não vale em outro', async () => {
    await guardarCodigo(db, { telefoneHmac: 'c-4', codigo: '123456', agora: ENVIO });
    await guardarCodigo(db, { telefoneHmac: 'c-5', codigo: '654321', agora: ENVIO });
    expect(
      await conferirCodigo(db, { telefoneHmac: 'c-4', codigo: '654321', agora: depois(1000) }),
    ).toEqual({ certo: false, motivo: 'errado', restantes: MAX_TENTATIVAS - 1 });
  });

  it('reenvio: espera 60 s desde o último envio; sem código, pode na hora', async () => {
    expect(await esperaParaReenviar(db, { telefoneHmac: 'c-6', agora: ENVIO })).toBe(0);
    await guardarCodigo(db, { telefoneHmac: 'c-6', codigo: '123456', agora: ENVIO });
    expect(await esperaParaReenviar(db, { telefoneHmac: 'c-6', agora: ENVIO })).toBe(
      REENVIO_APOS_MS,
    );
    expect(await esperaParaReenviar(db, { telefoneHmac: 'c-6', agora: depois(45_000) })).toBe(
      15_000,
    );
    expect(
      await esperaParaReenviar(db, { telefoneHmac: 'c-6', agora: depois(REENVIO_APOS_MS) }),
    ).toBe(0);
  });

  it('código novo zera as tentativas e o antigo deixa de valer', async () => {
    await guardarCodigo(db, { telefoneHmac: 'c-7', codigo: '111111', agora: ENVIO });
    for (let i = 0; i < MAX_TENTATIVAS; i++) {
      await conferirCodigo(db, { telefoneHmac: 'c-7', codigo: '000000', agora: depois(1000) });
    }
    await guardarCodigo(db, { telefoneHmac: 'c-7', codigo: '222222', agora: depois(60_000) });
    expect(
      await conferirCodigo(db, { telefoneHmac: 'c-7', codigo: '111111', agora: depois(61_000) }),
    ).toEqual({ certo: false, motivo: 'errado', restantes: MAX_TENTATIVAS - 1 });
    expect(
      await conferirCodigo(db, { telefoneHmac: 'c-7', codigo: '222222', agora: depois(62_000) }),
    ).toEqual({ certo: true });
  });

  it('apagarCodigo tira só o do telefone', async () => {
    await guardarCodigo(db, { telefoneHmac: 'c-8', codigo: '123456', agora: ENVIO });
    await guardarCodigo(db, { telefoneHmac: 'c-9', codigo: '123456', agora: ENVIO });
    await apagarCodigo(db, 'c-8');
    expect(await linhaDe('c-8')).toBeUndefined();
    expect(await linhaDe('c-9')).toBeDefined();
  });
});
