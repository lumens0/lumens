import { describe, expect, it, vi } from 'vitest';
import {
  ASSUNTO_DO_CODIGO,
  criarEmailSmtp,
  logEmail,
  textoDoCodigo,
  type MensagemDeEmail,
} from './codigo';

const SMTP = {
  host: 'smtp.teste',
  porta: 587,
  usuario: 'u',
  senha: 's',
  remetente: 'Lumens <lumens@exemplo.com>',
};

describe('criarEmailSmtp', () => {
  it('envia texto simples, do remetente da equipe, com o código e a validade', async () => {
    const mensagens: MensagemDeEmail[] = [];
    const email = criarEmailSmtp({
      ...SMTP,
      transporte: {
        sendMail: (mensagem) => {
          mensagens.push(mensagem);
          return Promise.resolve({});
        },
      },
    });

    expect(await email.enviarCodigo('aluno@ufal.br', '012345')).toBe(true);
    expect(mensagens).toEqual([
      {
        from: 'Lumens <lumens@exemplo.com>',
        to: 'aluno@ufal.br',
        subject: ASSUNTO_DO_CODIGO,
        text: textoDoCodigo('012345'),
      },
    ]);
    expect(mensagens[0]?.text).toContain('012345');
    expect(mensagens[0]?.text).toContain('10 minutos');
    // Sem HTML e sem links: o que menos cai em spam.
    expect(mensagens[0]).not.toHaveProperty('html');
    expect(mensagens[0]?.text).not.toMatch(/https?:\/\//);
  });

  it('o código não vai no assunto (a notificação do celular não o mostra)', () => {
    expect(ASSUNTO_DO_CODIGO).not.toMatch(/\d/);
  });

  it('falha do servidor vira false e avisa sem o endereço nem o código', async () => {
    const avisos: string[] = [];
    const email = criarEmailSmtp({
      ...SMTP,
      transporte: { sendMail: () => Promise.reject(new Error('ECONNREFUSED aluno@ufal.br')) },
      avisar: (mensagem) => avisos.push(mensagem),
    });

    expect(await email.enviarCodigo('aluno@ufal.br', '987654')).toBe(false);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).not.toContain('aluno@ufal.br');
    expect(avisos[0]).not.toContain('987654');
  });
});

describe('logEmail (pnpm dev)', () => {
  it('não envia: mostra o código no log, sem o endereço', async () => {
    const info = vi.fn();
    const email = logEmail({ info } as never);
    expect(await email.enviarCodigo('aluno@ufal.br', '555123')).toBe(true);
    expect(info).toHaveBeenCalledOnce();
    expect(JSON.stringify(info.mock.calls)).toContain('555123');
    expect(JSON.stringify(info.mock.calls)).not.toContain('aluno@ufal.br');
  });
});
