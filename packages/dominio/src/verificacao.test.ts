import { describe, expect, it } from 'vitest';
import { EMAIL_MAXIMO, emailInstitucional, normalizarEmail } from './verificacao';

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
