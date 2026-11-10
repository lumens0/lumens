import { curadores, eq, estudantes, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeEach, describe, expect, it } from 'vitest';
import { cifrar, decifrar } from '../cripto';
import { rotacionarCifra } from './rotacao';

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

  it('rotaciona os dados de curadores e estudantes com sucesso', async () => {
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
    expect(contagens).toEqual({ curadores: 2, estudantes: 2 });

    if (!curador1 || !curador2 || !estudante1 || !estudante2) throw new Error('dados não criados');

    // Curadores: decifráveis com CHAVE_B, falham com CHAVE_A
    const [c1Atualizado] = await db.select().from(curadores).where(eq(curadores.id, curador1.id));
    const [c2Atualizado] = await db.select().from(curadores).where(eq(curadores.id, curador2.id));
    if (!c1Atualizado || !c2Atualizado) throw new Error('curadores não atualizados');

    expect(decifrar(c1Atualizado.emailCifrado, CHAVE_B)).toBe('curador1@ufal.br');
    expect(() => decifrar(c1Atualizado.emailCifrado, CHAVE_A)).toThrow();

    expect(decifrar(c2Atualizado.emailCifrado, CHAVE_B)).toBe('curador2@ufal.br');
    expect(() => decifrar(c2Atualizado.emailCifrado, CHAVE_A)).toThrow();

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
    expect(decifrar(e1Atualizado.emailCifrado, CHAVE_B)).toBe('estudante1@ufal.br');
    expect(() => decifrar(e1Atualizado.emailCifrado, CHAVE_A)).toThrow();

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
    expect(contagens).toEqual({ curadores: 0, estudantes: 2 });

    const [e1] = await db
      .select()
      .from(estudantes)
      .where(eq(estudantes.id, estudanteAmbosSaiu.id));
    if (!e1) throw new Error('e1 não encontrado');
    expect(e1.telefoneCifrado).toBe('saiu:lapide-tel-1');
    expect(e1.emailCifrado).toBe('saiu:lapide-email-1');

    const [e2] = await db
      .select()
      .from(estudantes)
      .where(eq(estudantes.id, estudanteEmailSaiu.id));
    if (!e2) throw new Error('e2 não encontrado');
    expect(decifrar(e2.telefoneCifrado, CHAVE_B)).toBe('+5582999990003');
    expect(() => decifrar(e2.telefoneCifrado, CHAVE_A)).toThrow();
    expect(e2.emailCifrado).toBe('saiu:lapide-email-2');

    const [e3] = await db.select().from(estudantes).where(eq(estudantes.id, estudanteTelSaiu.id));
    if (!e3) throw new Error('e3 não encontrado');
    expect(e3.telefoneCifrado).toBe('saiu:lapide-tel-3');
    if (e3.emailCifrado === null) throw new Error('email e3 não esperado null');
    expect(decifrar(e3.emailCifrado, CHAVE_B)).toBe('estudante3@ufal.br');
    expect(() => decifrar(e3.emailCifrado, CHAVE_A)).toThrow();
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

  it('faz rollback e não altera nenhum registro se a decifragem falhar no curador', async () => {
    const curadorOriginal = cifrar('curador1@ufal.br', CHAVE_A);
    const [curador1] = await db
      .insert(curadores)
      .values({
        emailHmac: 'hmac_c1',
        emailCifrado: curadorOriginal,
        nome: 'Curador 1',
      })
      .returning();
    if (!curador1) throw new Error('curador1 não criado');

    // Curador com payload inválido/corrompido
    await db.insert(curadores).values({
      emailHmac: 'hmac_c2',
      emailCifrado: 'dados-invalidos',
      nome: 'Curador 2',
    });

    await expect(rotacionarCifra(db, CHAVE_A, CHAVE_B)).rejects.toThrow();

    const [c1] = await db.select().from(curadores).where(eq(curadores.id, curador1.id));
    if (!c1) throw new Error('c1 não encontrado');
    expect(c1.emailCifrado).toBe(curadorOriginal);
    expect(decifrar(c1.emailCifrado, CHAVE_A)).toBe('curador1@ufal.br');
    expect(() => decifrar(c1.emailCifrado, CHAVE_B)).toThrow();
  });
});
