import { describe, expect, it, vi } from 'vitest';
import {
  ASSUNTO_DO_CODIGO,
  criarEmailSmtp,
  logEmail,
  textoDoCodigo,
  type MensagemDeEmail,
} from './codigo';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { createTransport } from 'nodemailer';
import { opcoesDoTransporte } from './codigo';

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

/**
 * Servidor SMTP falso que não oferece STARTTLS: é o que um intermediário consegue mostrar ao
 * apagar o STARTTLS da resposta do servidor de verdade. Aceita tudo em claro e anota os comandos.
 */
async function smtpSemStarttls() {
  const comandos: string[] = [];
  const servidor: Server = createServer((socket) => {
    let emDados = false;
    socket.write('220 falso ESMTP\r\n');
    socket.on('data', (pedaco: Buffer) => {
      for (const linha of pedaco.toString('utf8').split('\r\n')) {
        if (emDados) {
          if (linha === '.') {
            emDados = false;
            socket.write('250 recebido\r\n');
          }
          continue;
        }
        if (linha === '') continue;
        comandos.push(linha.split(' ')[0]?.toUpperCase() ?? '');
        if (/^EHLO/i.test(linha)) socket.write('250-falso\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (/^AUTH/i.test(linha)) socket.write('235 autenticado\r\n');
        else if (/^DATA/i.test(linha)) {
          emDados = true;
          socket.write('354 manda\r\n');
        } else if (/^QUIT/i.test(linha)) socket.end('221 tchau\r\n');
        else socket.write('250 ok\r\n');
      }
    });
    socket.on('error', () => undefined);
  });
  await new Promise<void>((pronto) => servidor.listen(0, '127.0.0.1', pronto));
  const { port } = servidor.address() as AddressInfo;
  return { porta: port, comandos, fechar: () => servidor.close() };
}

describe('STARTTLS obrigatório fora da 465 (SCRUM-304)', () => {
  it('na 587 exige o STARTTLS; na 465 usa TLS desde o início', () => {
    expect(opcoesDoTransporte({ ...SMTP, porta: 587 })).toMatchObject({
      secure: false,
      requireTLS: true,
    });
    expect(opcoesDoTransporte({ ...SMTP, porta: 465 })).toMatchObject({
      secure: true,
      requireTLS: false,
    });
  });

  it('servidor sem STARTTLS: o envio falha antes de autenticar, e nada sai em claro', async () => {
    const falso = await smtpSemStarttls();
    try {
      const avisos: string[] = [];
      const email = criarEmailSmtp({
        ...SMTP,
        host: '127.0.0.1',
        porta: falso.porta,
        avisar: (mensagem) => avisos.push(mensagem),
      });

      expect(await email.enviarCodigo('aluno@ufal.br', '135790')).toBe(false);
      expect(falso.comandos).not.toContain('AUTH');
      expect(falso.comandos).not.toContain('MAIL');
      expect(avisos).toHaveLength(1);
    } finally {
      falso.fechar();
    }
  });

  it('o mesmo servidor aceita o envio se o STARTTLS não for exigido (o teste acima é pelo TLS)', async () => {
    const falso = await smtpSemStarttls();
    try {
      const transporte = createTransport({
        ...opcoesDoTransporte({ ...SMTP, host: '127.0.0.1', porta: falso.porta }),
        requireTLS: false,
      });

      await transporte.sendMail({ from: 'a@exemplo.com', to: 'b@exemplo.com', text: 'oi' });
      expect(falso.comandos).toEqual(expect.arrayContaining(['AUTH', 'MAIL', 'DATA']));
    } finally {
      falso.fechar();
    }
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
