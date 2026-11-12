import { CURSOS, codigosVerificacao, eq, estudantes, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CODIGO_EXPIRA_MS,
  EMAIL_MAXIMO,
  MAX_TENTATIVAS,
  REENVIO_APOS_MS,
  apagarCodigo,
  concluirVerificacao,
  conferirCodigo,
  cursoValido,
  emailInstitucional,
  esperaParaReenviar,
  gerarCodigo,
  guardarCodigo,
  hashDoCodigo,
  normalizarEmail,
  vincularEmail,
  type NovoVinculo,
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

describe('vincularEmail (SCRUM-137, RN01)', () => {
  let db: Db;
  beforeAll(async () => {
    db = await criarBancoEmMemoria();
  }, 60_000);

  const vinculo = (telefone: string, email: string): NovoVinculo => ({
    telefoneHmac: `tel-${telefone}`,
    telefoneCifrado: `cifra-tel-${telefone}`,
    emailHmac: `hmac-${email}`,
    emailCifrado: `cifra-${email}`,
  });
  const estudanteDe = async (telefone: string) =>
    (
      await db
        .select()
        .from(estudantes)
        .where(eq(estudantes.telefoneHmac, `tel-${telefone}`))
    )[0];

  it('telefone novo: cria o estudante com o e-mail, ainda sem verificado_em', async () => {
    const resultado = await vincularEmail(db, vinculo('1', 'a@ufal.br'));
    const estudante = await estudanteDe('1');
    expect(resultado).toEqual({ vinculado: true, estudanteId: estudante?.id });
    expect(estudante).toMatchObject({
      telefoneHmac: 'tel-1',
      telefoneCifrado: 'cifra-tel-1',
      emailHmac: 'hmac-a@ufal.br',
      emailCifrado: 'cifra-a@ufal.br',
      verificadoEm: null,
      saiuEm: null,
      canal: 'whatsapp',
    });
  });

  it('cadastro criado pelo Telegram guarda o canal', async () => {
    await vincularEmail(db, { ...vinculo('tg', 'tg@ufal.br'), canal: 'telegram' });
    expect((await estudanteDe('tg'))?.canal).toBe('telegram');
  });

  it('o mesmo telefone com o mesmo e-mail de novo: mesmo estudante, sem duplicar', async () => {
    const primeiro = await vincularEmail(db, vinculo('2', 'b@ufal.br'));
    const segundo = await vincularEmail(db, vinculo('2', 'b@ufal.br'));
    expect(segundo).toEqual(primeiro);
    expect(
      await db.select().from(estudantes).where(eq(estudantes.telefoneHmac, 'tel-2')),
    ).toHaveLength(1);
  });

  it('e-mail de outro telefone: recusa e não mexe em nenhum dos dois', async () => {
    await vincularEmail(db, vinculo('3', 'c@ufal.br'));
    const antes = await estudanteDe('3');

    expect(await vincularEmail(db, vinculo('4', 'c@ufal.br'))).toEqual({
      vinculado: false,
      motivo: 'email_em_uso',
    });
    expect(await estudanteDe('3')).toEqual(antes);
    expect(await estudanteDe('4')).toBeUndefined();
  });

  it('telefone com cadastro troca de e-mail: mantém verificação e saída, e o antigo fica livre', async () => {
    await vincularEmail(db, vinculo('5', 'd@ufal.br'));
    const verificadoEm = new Date('2026-10-01T12:00:00Z');
    await db.update(estudantes).set({ verificadoEm }).where(eq(estudantes.telefoneHmac, 'tel-5'));
    const antes = await estudanteDe('5');

    expect(await vincularEmail(db, vinculo('5', 'e@ufal.br'))).toEqual({
      vinculado: true,
      estudanteId: antes?.id,
    });
    expect(await estudanteDe('5')).toMatchObject({
      emailHmac: 'hmac-e@ufal.br',
      emailCifrado: 'cifra-e@ufal.br',
      verificadoEm,
      saiuEm: null,
    });
    expect((await vincularEmail(db, vinculo('6', 'd@ufal.br'))).vinculado).toBe(true);
  });

  it('estudante que saiu e volta pelo mesmo telefone continua o mesmo cadastro', async () => {
    await vincularEmail(db, vinculo('7', 'f@ufal.br'));
    const saiuEm = new Date('2026-10-05T12:00:00Z');
    await db.update(estudantes).set({ saiuEm }).where(eq(estudantes.telefoneHmac, 'tel-7'));
    const antes = await estudanteDe('7');

    expect(await vincularEmail(db, vinculo('7', 'f@ufal.br'))).toEqual({
      vinculado: true,
      estudanteId: antes?.id,
    });
    // Quem volta a valer (limpar `saiu_em`, marcar `verificado_em`) é o fim da 2.4, não o vínculo.
    expect((await estudanteDe('7'))?.saiuEm).toEqual(saiuEm);
  });
});

describe('concluirVerificacao (SCRUM-138)', () => {
  let db: Db;
  beforeAll(async () => {
    db = await criarBancoEmMemoria();
  }, 60_000);

  const AGORA = new Date('2026-11-10T20:00:00Z');
  const CURSO = 'Ciência da Computação';
  const vinculado = async (telefone: string) =>
    vincularEmail(db, {
      telefoneHmac: `tel-${telefone}`,
      telefoneCifrado: `cifra-tel-${telefone}`,
      emailHmac: `hmac-${telefone}@ufal.br`,
      emailCifrado: `cifra-${telefone}@ufal.br`,
    });
  const estudanteDe = async (telefone: string) =>
    (
      await db
        .select()
        .from(estudantes)
        .where(eq(estudantes.telefoneHmac, `tel-${telefone}`))
    )[0];

  it('só aceita curso da lista', () => {
    for (const curso of CURSOS) expect(cursoValido(curso)).toBe(true);
    expect(cursoValido('Maria da Silva')).toBe(false);
    expect(cursoValido('ciência da computação')).toBe(false);
  });

  it('grava o curso e marca verificado agora', async () => {
    await vinculado('1');
    const resultado = await concluirVerificacao(db, {
      telefoneHmac: 'tel-1',
      curso: CURSO,
      agora: AGORA,
    });
    const estudante = await estudanteDe('1');
    expect(resultado).toEqual({ verificado: true, estudanteId: estudante?.id });
    expect(estudante).toMatchObject({ curso: CURSO, verificadoEm: AGORA, saiuEm: null });
  });

  it('curso fora da lista não grava nada', async () => {
    await vinculado('2');
    expect(
      await concluirVerificacao(db, {
        telefoneHmac: 'tel-2',
        curso: 'Maria da Silva',
        agora: AGORA,
      }),
    ).toEqual({ verificado: false, motivo: 'curso_invalido' });
    expect(await estudanteDe('2')).toMatchObject({ curso: null, verificadoEm: null });
  });

  it('sem cadastro, ou cadastro sem e-mail, não verifica', async () => {
    expect(
      await concluirVerificacao(db, { telefoneHmac: 'tel-3', curso: CURSO, agora: AGORA }),
    ).toEqual({ verificado: false, motivo: 'sem_vinculo' });

    await db.insert(estudantes).values({ telefoneHmac: 'tel-4', telefoneCifrado: 'cifra-tel-4' });
    expect(
      await concluirVerificacao(db, { telefoneHmac: 'tel-4', curso: CURSO, agora: AGORA }),
    ).toEqual({ verificado: false, motivo: 'sem_vinculo' });
    expect((await estudanteDe('4'))?.verificadoEm).toBeNull();
  });

  it('quem já era verificado mantém a data da primeira verificação', async () => {
    await vinculado('5');
    const primeira = new Date('2026-09-01T12:00:00Z');
    await concluirVerificacao(db, { telefoneHmac: 'tel-5', curso: CURSO, agora: primeira });
    await concluirVerificacao(db, { telefoneHmac: 'tel-5', curso: 'Direito', agora: AGORA });
    expect(await estudanteDe('5')).toMatchObject({ curso: 'Direito', verificadoEm: primeira });
  });

  it('quem tinha saído volta a valer: saiu_em limpo e verificado agora', async () => {
    await vinculado('6');
    await concluirVerificacao(db, {
      telefoneHmac: 'tel-6',
      curso: CURSO,
      agora: new Date('2026-09-01T12:00:00Z'),
    });
    await db
      .update(estudantes)
      .set({ saiuEm: new Date('2026-10-01T12:00:00Z') })
      .where(eq(estudantes.telefoneHmac, 'tel-6'));

    await concluirVerificacao(db, { telefoneHmac: 'tel-6', curso: CURSO, agora: AGORA });
    expect(await estudanteDe('6')).toMatchObject({ verificadoEm: AGORA, saiuEm: null });
  });
});
