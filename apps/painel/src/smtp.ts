/**
 * Opções do SMTP do link de login (SCRUM-304). 465 é TLS desde o início; nas outras portas (587)
 * a conexão começa sem TLS e passa a TLS pelo STARTTLS, que `requireTLS` torna obrigatório. Sem
 * ele, um intermediário que apagasse o STARTTLS da resposta do servidor faria o Nodemailer
 * autenticar e enviar em claro: vazariam a senha do SMTP e o link de login do curador.
 */
export interface ServidorSmtp {
  host: string;
  porta: number;
  usuario: string;
  senha: string;
}

export function opcoesSmtp({ host, porta, usuario, senha }: ServidorSmtp) {
  return {
    host,
    port: porta,
    secure: porta === 465,
    requireTLS: porta !== 465,
    auth: { user: usuario, pass: senha },
  };
}
