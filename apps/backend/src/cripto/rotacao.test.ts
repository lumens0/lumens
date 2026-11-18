import { conversas, curadores, eq, estudantes, sql, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { cifrar, decifrar } from './cifra';
import { FilaComJobsPendentesError, rotacionarCifra } from './rotacao';

const CHAVE_A = Buffer.alloc(32, 1);
const CHAVE_B = Buffer.alloc(32, 2);
const CHAVE_C = Buffer.alloc(32, 3);

describe('rotacao de chaves de cifra (SCRUM-90)', () => {
  let db: Db;

  beforeEach(async () => {
    db = await criarBancoEmMemoria();
  }, 20_000);

  it('recusa chaves com tamanho diferente de 32 bytes ou iguais', async () => {
    await expect(rotacionarCifra(db, Buffer.alloc(16), CHAVE_B)).rejects.toThrow(
      'As chaves de cifra precisam ter exatamente 32 bytes.',
    );
    await expect(rotacionarCifra(db, CHAVE_A, Buffer.alloc(16))).rejects.toThrow(
      'As chaves de cifra precisam ter exatamente 32 bytes.',
    );
    await expect(rotacionarCifra(db, CHAVE_A, CHAVE_A)).rejects.toThrow(
      'A chave nova deve ser diferente da chave antiga.',
    );
  });

  it('rotaciona os dados dos estudantes e não mexe no e-mail dos curadores', async () => {
    const [curador1, curador2] = await db
      .insert(curadores)
      .values([
        {
          emailHmac: 'hmac_curador_1',
          emailCifrado: cifrar('curador1@ufal.br', CHAVE_A),
          nome: 'Curador 1',
        },
        {
          emailHmac: 'hmac_curador_2',
          emailCifrado: cifrar('curador2@ufal.br', CHAVE_A),
          nome: 'Curador 2',
        },
      ])
      .returning();
    expect(curador1).toBeDefined();
    expect(curador2).toBeDefined();

    const [estudante1, estudante2] = await db
      .insert(estudantes)
      .values([
        {
          telefoneHmac: 'hmac_tel_1',
          telefoneCifrado: cifrar('+5582999990001', CHAVE_A),
          emailHmac: 'hmac_email_1',
          emailCifrado: cifrar('estudante1@ufal.br', CHAVE_A),
        },
        {
          telefoneHmac: 'hmac_tel_2',
          telefoneCifrado: cifrar('+5582999990002', CHAVE_A),
          emailHmac: null,
          emailCifrado: null,
        },
      ])
      .returning();
    expect(estudante1).toBeDefined();
    expect(estudante2).toBeDefined();

    const contagens = await rotacionarCifra(db, CHAVE_A, CHAVE_B);
    expect(contagens).toEqual({ estudantes: 2, conversas: 0, jobsApagados: 0 });

    if (!curador1 || !curador2 || !estudante1 || !estudante2) throw new Error('dados não criados');

    // Curadores: ficam como estavam. O e-mail deles usa a CHAVE_CIFRA_PAINEL, que tem a sua própria
    // recifragem (`recifrarEmailsDeCuradores`).
    const [c1Atualizado] = await db.select().from(curadores).where(eq(curadores.id, curador1.id));
    const [c2Atualizado] = await db.select().from(curadores).where(eq(curadores.id, curador2.id));
    if (!c1Atualizado || !c2Atualizado) throw new Error('curadores não atualizados');

    expect(c1Atualizado.emailCifrado).toBe(curador1.emailCifrado);
    expect(c2Atualizado.emailCifrado).toBe(curador2.emailCifrado);

    // Estudantes: decifráveis com CHAVE_B, falham com CHAVE_A
    const [e1Atualizado] = await db
      .select()
      .from(estudantes)
      .where(eq(estudantes.id, estudante1.id));
    const [e2Atualizado] = await db
      .select()
      .from(estudantes)
      .where(eq(estudantes.id, estudante2.id));
    if (!e1Atualizado || !e2Atualizado) throw new Error('estudantes não atualizados');

    expect(decifrar(e1Atualizado.telefoneCifrado, CHAVE_B)).toBe('+5582999990001');
    expect(() => decifrar(e1Atualizado.telefoneCifrado, CHAVE_A)).toThrow();

    if (e1Atualizado.emailCifrado === null) throw new Error('email não esperado null');
    const email1 = e1Atualizado.emailCifrado;
    expect(decifrar(email1, CHAVE_B)).toBe('estudante1@ufal.br');
    expect(() => decifrar(email1, CHAVE_A)).toThrow();

    expect(decifrar(e2Atualizado.telefoneCifrado, CHAVE_B)).toBe('+5582999990002');
    expect(() => decifrar(e2Atualizado.telefoneCifrado, CHAVE_A)).toThrow();
    expect(e2Atualizado.emailCifrado).toBeNull();
  });

  it('preserva lápides saiu:... intactas sem decifrá-las', async () => {
    const [estudanteAmbosSaiu, estudanteEmailSaiu, estudanteTelSaiu] = await db
      .insert(estudantes)
      .values([
        {
          telefoneHmac: 'hmac_ambos_saiu',
          telefoneCifrado: 'saiu:lapide-tel-1',
          emailHmac: 'hmac_email_saiu_1',
          emailCifrado: 'saiu:lapide-email-1',
        },
        {
          telefoneHmac: 'hmac_email_saiu',
          telefoneCifrado: cifrar('+5582999990003', CHAVE_A),
          emailHmac: 'hmac_email_saiu_2',
          emailCifrado: 'saiu:lapide-email-2',
        },
        {
          telefoneHmac: 'hmac_tel_saiu',
          telefoneCifrado: 'saiu:lapide-tel-3',
          emailHmac: 'hmac_email_normal',
          emailCifrado: cifrar('estudante3@ufal.br', CHAVE_A),
        },
      ])
      .returning();
    expect(estudanteAmbosSaiu).toBeDefined();
    expect(estudanteEmailSaiu).toBeDefined();
    if (!estudanteAmbosSaiu || !estudanteEmailSaiu || !estudanteTelSaiu) {
      throw new Error('estudantes não criados');
    }

    const contagens = await rotacionarCifra(db, CHAVE_A, CHAVE_B);
    // estudanteAmbosSaiu não foi alterado; estudanteEmailSaiu e estudanteTelSaiu tiveram 1 campo recifrado cada.
    expect(contagens).toEqual({ estudantes: 2, conversas: 0, jobsApagados: 0 });

    const [e1] = await db.select().from(estudantes).where(eq(estudantes.id, estudanteAmbosSaiu.id));
    if (!e1) throw new Error('e1 não encontrado');
    expect(e1.telefoneCifrado).toBe('saiu:lapide-tel-1');
    expect(e1.emailCifrado).toBe('saiu:lapide-email-1');

    const [e2] = await db.select().from(estudantes).where(eq(estudantes.id, estudanteEmailSaiu.id));
    if (!e2) throw new Error('e2 não encontrado');
    expect(decifrar(e2.telefoneCifrado, CHAVE_B)).toBe('+5582999990003');
    expect(() => decifrar(e2.telefoneCifrado, CHAVE_A)).toThrow();
    expect(e2.emailCifrado).toBe('saiu:lapide-email-2');

    const [e3] = await db.select().from(estudantes).where(eq(estudantes.id, estudanteTelSaiu.id));
    if (!e3) throw new Error('e3 não encontrado');
    expect(e3.telefoneCifrado).toBe('saiu:lapide-tel-3');
    if (e3.emailCifrado === null) throw new Error('email e3 não esperado null');
    const email3 = e3.emailCifrado;
    expect(decifrar(email3, CHAVE_B)).toBe('estudante3@ufal.br');
    expect(() => decifrar(email3, CHAVE_A)).toThrow();
  });

  it('faz rollback e não altera nenhum registro se a decifragem falhar no estudante', async () => {
    const curadorOriginal = cifrar('curador@ufal.br', CHAVE_A);
    const telOriginal = cifrar('+5582999990001', CHAVE_A);

    const [curador] = await db
      .insert(curadores)
      .values({
        emailHmac: 'hmac_curador_ok',
        emailCifrado: curadorOriginal,
        nome: 'Curador OK',
      })
      .returning();
    if (!curador) throw new Error('curador não criado');

    const [estudanteOk] = await db
      .insert(estudantes)
      .values({
        telefoneHmac: 'hmac_estudante_ok',
        telefoneCifrado: telOriginal,
        emailHmac: null,
        emailCifrado: null,
      })
      .returning();
    if (!estudanteOk) throw new Error('estudanteOk não criado');

    // Inserir um estudante cujo telefone foi cifrado com CHAVE_C (chave errada para rotação A->B)
    await db.insert(estudantes).values({
      telefoneHmac: 'hmac_estudante_errado',
      telefoneCifrado: cifrar('+5582999999999', CHAVE_C),
      emailHmac: null,
      emailCifrado: null,
    });

    await expect(rotacionarCifra(db, CHAVE_A, CHAVE_B)).rejects.toThrow();

    // Curador deve manter o valor e a chave antiga
    const [c] = await db.select().from(curadores).where(eq(curadores.id, curador.id));
    if (!c) throw new Error('curador não encontrado');
    expect(c.emailCifrado).toBe(curadorOriginal);
    expect(decifrar(c.emailCifrado, CHAVE_A)).toBe('curador@ufal.br');
    expect(() => decifrar(c.emailCifrado, CHAVE_B)).toThrow();

    // Estudante válido deve manter o valor e a chave antiga
    const [e] = await db.select().from(estudantes).where(eq(estudantes.id, estudanteOk.id));
    if (!e) throw new Error('estudante não encontrado');
    expect(e.telefoneCifrado).toBe(telOriginal);
    expect(decifrar(e.telefoneCifrado, CHAVE_A)).toBe('+5582999990001');
    expect(() => decifrar(e.telefoneCifrado, CHAVE_B)).toThrow();
  });

  it('não lê o e-mail dos curadores: um cifrado com outra chave não atrapalha a rotação', async () => {
    const curadorOriginal = cifrar('curador@ufal.br', CHAVE_C);
    const [curador] = await db
      .insert(curadores)
      .values({ emailHmac: 'hmac_curador_painel', emailCifrado: curadorOriginal, nome: 'Painel' })
      .returning();
    if (!curador) throw new Error('curador não criado');

    await expect(rotacionarCifra(db, CHAVE_A, CHAVE_B)).resolves.toBeDefined();

    const [c] = await db.select().from(curadores).where(eq(curadores.id, curador.id));
    expect(c?.emailCifrado).toBe(curadorOriginal);
  });

  describe('conversas em andamento e filas do bot (SCRUM-311)', () => {
    /** As colunas do pg-boss que a rotação usa; o PGlite dos testes não tem o pg-boss. */
    async function criarFilaDoPgBoss() {
      await db.execute(sql`create schema pgboss`);
      await db.execute(
        sql`create table pgboss.job (id serial primary key, name text not null, state text not null, data jsonb)`,
      );
    }
    const job = (name: string, state: string, conteudo = 'oi') =>
      db.execute(
        sql`insert into pgboss.job (name, state, data)
            values (${name}, ${state}, ${JSON.stringify({ contentCifrado: cifrar(conteudo, CHAVE_A) })}::jsonb)`,
      );
    interface Linhas {
      rows: { name: string; state: string }[];
    }
    const jobs = async () => {
      const resultado = (await db.execute(
        sql`select name, state from pgboss.job order by id`,
      )) as Linhas;
      return resultado.rows;
    };

    it('recifra os campos cifrados de conversa.dados, de qualquer nome, e deixa o resto igual', async () => {
      await db.insert(conversas).values([
        {
          telefoneHmac: 'pauta-nova',
          passo: 'NEW_ASK_PHOTO',
          dados: {
            tituloCifrado: cifrar('Bebedouro quebrado', CHAVE_A),
            descricaoCifrada: cifrar('Sem água desde segunda', CHAVE_A),
            blocoId: 'bloco-18',
            pendingCommand: { kind: 'apoiar', alvo: 'x' },
          },
        },
        {
          telefoneHmac: 'verificacao',
          passo: 'VERIFY_ASK_CODE',
          dados: { emailCifrado: cifrar('aluno@ufal.br', CHAVE_A) },
        },
        { telefoneHmac: 'no-menu', passo: 'MENU', dados: {} },
      ]);

      const contagens = await rotacionarCifra(db, CHAVE_A, CHAVE_B);
      expect(contagens).toMatchObject({ conversas: 2 });

      const linhas = Object.fromEntries(
        (await db.select().from(conversas)).map((c) => [c.telefoneHmac, c.dados]),
      );
      const pauta = linhas['pauta-nova'] as Record<string, string>;
      expect(decifrar(pauta.tituloCifrado ?? '', CHAVE_B)).toBe('Bebedouro quebrado');
      expect(decifrar(pauta.descricaoCifrada ?? '', CHAVE_B)).toBe('Sem água desde segunda');
      expect(pauta).toMatchObject({ blocoId: 'bloco-18', pendingCommand: { kind: 'apoiar' } });
      const email = (linhas.verificacao as Record<string, string>).emailCifrado ?? '';
      expect(decifrar(email, CHAVE_B)).toBe('aluno@ufal.br');
      expect(() => decifrar(email, CHAVE_A)).toThrow();
      expect(linhas['no-menu']).toEqual({});
    });

    it('depois da rotação, nenhuma conversa guarda dado que decifre com a chave antiga', async () => {
      await db.insert(conversas).values({
        telefoneHmac: 'relato',
        passo: 'SUPPORT_ASK_PHOTO',
        dados: {
          relatoCifrado: cifrar('vazando', CHAVE_A),
          menuEmTexto: cifrar('{"opcoes":[]}', CHAVE_A),
        },
      });

      await rotacionarCifra(db, CHAVE_A, CHAVE_B);

      for (const { dados } of await db.select().from(conversas)) {
        for (const valor of Object.values(dados)) {
          if (typeof valor === 'string') expect(() => decifrar(valor, CHAVE_A)).toThrow();
        }
      }
    });

    it('com job do bot pendente na fila, recusa e não muda nada', async () => {
      await criarFilaDoPgBoss();
      await job('incoming-message', 'created');
      const telefone = cifrar('+5582999990001', CHAVE_A);
      await db.insert(estudantes).values({ telefoneHmac: 'h', telefoneCifrado: telefone });

      await expect(rotacionarCifra(db, CHAVE_A, CHAVE_B)).rejects.toBeInstanceOf(
        FilaComJobsPendentesError,
      );
      const [e] = await db.select().from(estudantes);
      expect(e?.telefoneCifrado).toBe(telefone);
      expect(await jobs()).toHaveLength(1);
    });

    it('apaga os jobs encerrados e os das filas de mortas; jobs de outras filas ficam', async () => {
      await criarFilaDoPgBoss();
      await job('incoming-message', 'completed');
      await job('outgoing-replies', 'failed');
      await job('incoming-message-dead', 'created');
      await job('outgoing-replies-dead', 'created');
      await job('agendador-gatilhos', 'created');

      const contagens = await rotacionarCifra(db, CHAVE_A, CHAVE_B);

      expect(contagens.jobsApagados).toBe(4);
      expect(await jobs()).toEqual([{ name: 'agendador-gatilhos', state: 'created' }]);
    });
  });
});
