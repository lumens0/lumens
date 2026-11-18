/**
 * Liga o e-mail do link de login à gravação do token (SCRUM-305). O Auth.js chama, no mesmo
 * pedido, `createVerificationToken` (que recebe o token em hash) e `sendVerificationRequest` (que
 * recebe o token em claro). O hash é `sha256(token + segredo)`, então o mesmo pedido é achado pelo
 * token, não pelo e-mail: dois pedidos do mesmo e-mail no mesmo processo não se confundem.
 *
 * O e-mail só sai se a gravação deste pedido deu certo: barrada pelo limite de um por minuto, ou
 * falha do banco, não sai (um link que não existe no banco só enganaria quem o recebesse).
 */
import { createHash } from 'node:crypto';

/** O mesmo hash que o Auth.js grava no adapter: SHA-256 hexadecimal de `token + segredo`. */
export const hashDoToken = (token: string, segredo: string): string =>
  createHash('sha256').update(`${token}${segredo}`).digest('hex');

export interface PedidoDeLink {
  identifier: string;
  url: string;
  from: string | undefined;
  /** O token em claro, como chega ao `sendVerificationRequest`. */
  token: string;
}

export type ResultadoDoEnvio = 'enviado' | 'barrado' | 'gravacao_falhou' | 'envio_falhou';

export function criarEnvioDoLink(
  segredo: string,
  enviar: (pedido: PedidoDeLink) => Promise<void>,
  registrarErro: (mensagem: string, erro: unknown) => void = (m, e) => {
    console.error(m, e);
  },
) {
  const gravacoes = new Map<string, Promise<boolean>>();
  return {
    /** Guarda a gravação do token (em hash, como o adapter a recebe). Devolve a mesma promessa. */
    guardar(tokenEmHash: string, gravacao: Promise<boolean>): Promise<boolean> {
      gravacoes.set(tokenEmHash, gravacao);
      // O erro é tratado em `enviar`; isto só evita rejeição não tratada se ninguém a aguardar.
      gravacao.catch(() => undefined);
      return gravacao;
    },
    async enviar(pedido: PedidoDeLink): Promise<ResultadoDoEnvio> {
      const chave = hashDoToken(pedido.token, segredo);
      const gravacao = gravacoes.get(chave);
      gravacoes.delete(chave);
      try {
        if ((await gravacao) !== true) return 'barrado';
      } catch (erro) {
        registrarErro('Link de acesso do painel não foi gravado:', erro);
        return 'gravacao_falhou';
      }
      try {
        await enviar(pedido);
        return 'enviado';
      } catch (erro) {
        registrarErro('Link de acesso do painel não saiu:', erro);
        return 'envio_falhou';
      }
    },
  };
}
