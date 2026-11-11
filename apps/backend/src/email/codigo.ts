/**
 * Envio do código de verificação (história 2.4, SCRUM-135).
 *
 * Texto simples, sem HTML nem links: é o formato que menos cai em spam e o que qualquer cliente
 * de e-mail mostra igual. O remetente é o da equipe (`EMAIL_REMETENTE`).
 *
 * Nada aqui vai para o log com o endereço ou o código: em caso de falha, só o tipo do erro.
 * A exceção é o `logEmail`, usado só no `pnpm dev`, que mostra o código para testar pelo
 * simulador sem caixa de e-mail.
 */
import { CODIGO_EXPIRA_MS } from '@lumens/dominio';
import { createTransport } from 'nodemailer';
import type { Logger } from '../logger';

export interface ServicoDeEmail {
  /** `true` se o servidor de e-mail aceitou a mensagem; `false` se falhou (a pessoa tenta de novo). */
  enviarCodigo(para: string, codigo: string): Promise<boolean>;
}

export interface MensagemDeEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
}

/** O pedaço do transporte do Nodemailer que usamos: deixa os testes passarem um falso. */
export interface Transporte {
  sendMail(mensagem: MensagemDeEmail): Promise<unknown>;
}

export interface OpcoesSmtp {
  host: string;
  porta: number;
  usuario: string;
  senha: string;
  remetente: string;
  /** Para os testes. Sem ele, usa o SMTP de `host` e `porta`. */
  transporte?: Transporte;
  /** Avisa a falha, sem o endereço nem o código. */
  avisar?: (mensagem: string) => void;
}

const MINUTOS = String(CODIGO_EXPIRA_MS / 60_000);

export const ASSUNTO_DO_CODIGO = 'Seu código de verificação do Lumens';

export function textoDoCodigo(codigo: string): string {
  return [
    'Olá!',
    '',
    `Seu código de verificação do Lumens é: ${codigo}`,
    '',
    `Ele vale por ${MINUTOS} minutos. Digite o código na conversa com o Lumens no WhatsApp.`,
    '',
    'Se você não pediu este código, ignore este e-mail: sem ele, ninguém usa o seu endereço.',
    '',
    'Equipe Lumens',
  ].join('\n');
}

export function criarEmailSmtp(opcoes: OpcoesSmtp): ServicoDeEmail {
  let transporte = opcoes.transporte;
  return {
    async enviarCodigo(para, codigo) {
      transporte ??= criarTransporteSmtp(opcoes);
      try {
        await transporte.sendMail({
          from: opcoes.remetente,
          to: para,
          subject: ASSUNTO_DO_CODIGO,
          text: textoDoCodigo(codigo),
        });
        return true;
      } catch (erro) {
        const tipo = erro instanceof Error ? erro.name : typeof erro;
        opcoes.avisar?.(`não consegui enviar o código de verificação por e-mail (${tipo})`);
        return false;
      }
    },
  };
}

function criarTransporteSmtp({ host, porta, usuario, senha }: OpcoesSmtp): Transporte {
  const smtp = createTransport({
    host,
    port: porta,
    // 465 é SMTP com TLS desde o início; 587 começa sem e passa a TLS (STARTTLS).
    secure: porta === 465,
    auth: { user: usuario, pass: senha },
    // Sem resposta do servidor, desiste: a mensagem do WhatsApp não fica presa esperando.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return { sendMail: (mensagem) => smtp.sendMail(mensagem) };
}

/** Só no `pnpm dev`: não envia, mostra o código no log para testar pelo simulador. */
export function logEmail(logger: Logger): ServicoDeEmail {
  return {
    enviarCodigo(_para, codigo) {
      logger.info({ codigo }, 'código de verificação (pnpm dev: e-mail não enviado)');
      return Promise.resolve(true);
    },
  };
}
