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
import type { Logger } from '../infra/logger';

export interface ServicoDeEmail {
  /** `true` se o servidor de e-mail aceitou a mensagem; `false` se falhou (a pessoa tenta de novo). */
  enviarCodigo(para: string, codigo: string): Promise<boolean>;
  /**
   * SCRUM-298: avisa o dono do e-mail que o cadastro dele passou para outro número ou chat (troca
   * de canal). Se não foi ele, alguém acertou o código e tomou o cadastro. Opcional só para os
   * falsos dos testes; o SMTP e o `logEmail` têm.
   */
  avisarTransferencia?(para: string, quando: Date): Promise<boolean>;
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
    `Ele vale por ${MINUTOS} minutos. Digite o código na conversa com o Lumens.`,
    '',
    'Se você não pediu este código, ignore este e-mail: sem ele, ninguém usa o seu endereço.',
    '',
    'Equipe Lumens',
  ].join('\n');
}

export const ASSUNTO_DA_TRANSFERENCIA = 'Seu cadastro no Lumens foi ligado a outro número';

const dataHoraBR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Maceio',
  dateStyle: 'short',
  timeStyle: 'short',
});

export function textoDaTransferencia(quando: Date): string {
  return [
    'Olá!',
    '',
    `Em ${dataHoraBR.format(quando)}, o seu cadastro no Lumens foi ligado a outro número de WhatsApp ou chat do Telegram, depois que o código de verificação enviado para este e-mail foi digitado lá.`,
    '',
    'Se foi você (trocou de número ou passou a usar o Telegram), não precisa fazer nada.',
    '',
    'Se não foi você, responda este e-mail o quanto antes: alguém pode estar usando o seu cadastro, com os seus apoios e as pautas que você cuida.',
    '',
    'Equipe Lumens',
  ].join('\n');
}

export function criarEmailSmtp(opcoes: OpcoesSmtp): ServicoDeEmail {
  let transporte = opcoes.transporte;
  async function enviar(mensagem: Omit<MensagemDeEmail, 'from'>, oQue: string) {
    transporte ??= criarTransporteSmtp(opcoes);
    try {
      await transporte.sendMail({ from: opcoes.remetente, ...mensagem });
      return true;
    } catch (erro) {
      const tipo = erro instanceof Error ? erro.name : typeof erro;
      opcoes.avisar?.(`não consegui enviar ${oQue} por e-mail (${tipo})`);
      return false;
    }
  }
  return {
    enviarCodigo: (para, codigo) =>
      enviar(
        { to: para, subject: ASSUNTO_DO_CODIGO, text: textoDoCodigo(codigo) },
        'o código de verificação',
      ),
    avisarTransferencia: (para, quando) =>
      enviar(
        { to: para, subject: ASSUNTO_DA_TRANSFERENCIA, text: textoDaTransferencia(quando) },
        'o aviso de transferência do cadastro',
      ),
  };
}

/**
 * Como conectar no SMTP. 465 é TLS desde o início; nas outras portas (587) a conexão começa sem
 * TLS e passa a TLS pelo STARTTLS. `requireTLS` (SCRUM-304) torna o STARTTLS obrigatório: sem ele,
 * um intermediário que apagasse o STARTTLS da resposta do servidor faria o Nodemailer autenticar
 * e enviar em claro, e vazariam a senha do SMTP e os códigos. Com ele, o envio falha.
 */
export function opcoesDoTransporte({ host, porta, usuario, senha }: OpcoesSmtp) {
  return {
    host,
    port: porta,
    secure: porta === 465,
    requireTLS: porta !== 465,
    auth: { user: usuario, pass: senha },
    // Sem resposta do servidor, desiste: a mensagem do WhatsApp não fica presa esperando.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

function criarTransporteSmtp(opcoes: OpcoesSmtp): Transporte {
  const smtp = createTransport(opcoesDoTransporte(opcoes));
  return { sendMail: (mensagem) => smtp.sendMail(mensagem) };
}

/** Só no `pnpm dev`: não envia, mostra o código no log para testar pelo simulador. */
export function logEmail(logger: Logger): ServicoDeEmail {
  return {
    enviarCodigo(_para, codigo) {
      logger.info({ codigo }, 'código de verificação (pnpm dev: e-mail não enviado)');
      return Promise.resolve(true);
    },
    avisarTransferencia(_para, quando) {
      logger.info({ quando }, 'aviso de transferência do cadastro (pnpm dev: e-mail não enviado)');
      return Promise.resolve(true);
    },
  };
}
