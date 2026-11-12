/**
 * Os avisos da fila (meta batida, resposta oficial, conferência...) pelo Telegram.
 *
 * O texto é o do catálogo de modelos (`whatsapp/modelos.ts`) com as variáveis preenchidas, mais o
 * rodapé: o mesmo que a pessoa leria no WhatsApp. Sem modelo aprovado nem janela de 24h — o
 * Telegram deixa o bot escrever primeiro para quem já falou com ele. Os botões viram teclado
 * inline: o de link abre a página da pauta, e os de resposta rápida levam no `callback_data` o
 * mesmo `payload` que o WhatsApp levaria (`tipo:aviso:índice`).
 *
 * Ritmo: o Telegram aceita ~30 mensagens/s no total e 1/s por chat. O lote é pequeno, então basta
 * não disparar em rajada: um intervalo mínimo entre envios e outro por chat. Um 429 espera o
 * `retry_after` e tenta de novo; se o Telegram pedir mais que isso, o canal para até o próximo lote.
 */
import { ORIGEM_SITE_PRODUCAO } from '@lumens/contratos';
import type { AvisoRenderizado } from '../envio/aviso';
import { ErroDeEnvio, type AvisoSender } from '../envio/sender';
import { classificarErro, ErroDaApiDoTelegram, type ApiDoTelegram } from './api';
import {
  botaoDeResposta,
  mensagensDoTexto,
  type BotaoDeLink,
  type BotaoInline,
  type EnvioDeMensagem,
} from './sender';

/**
 * Os `sendMessage` de um aviso. Pura. Lança se um payload não couber no `callback_data` (64 bytes:
 * `conferencia:<uuid>:0` tem 50).
 *
 * @param origem origem do site, sem barra no fim: o botão de link precisa da URL inteira.
 */
export function mensagensDoAviso(
  aviso: AvisoRenderizado,
  chatId: number,
  origem: string = ORIGEM_SITE_PRODUCAO,
): EnvioDeMensagem[] {
  const links: BotaoDeLink[][] = [];
  const respostas: BotaoInline[] = [];
  for (const botao of aviso.botoes) {
    if (botao.tipo === 'URL') links.push([{ text: botao.texto, url: origem + botao.caminho }]);
    else respostas.push(botaoDeResposta(botao.payload, botao.texto));
  }
  // Respostas rápidas lado a lado ("Sim | Em parte | Não"), como no WhatsApp; cada link numa linha.
  const teclado = [...links, ...(respostas.length > 0 ? [respostas] : [])];
  return mensagensDoTexto(
    `${aviso.texto}\n\n${aviso.modelo.rodape}`,
    chatId,
    teclado.length > 0 ? teclado : undefined,
  );
}

export interface OpcoesDosAvisos {
  api: Pick<ApiDoTelegram, 'chamar'>;
  /** Origem do site nos botões de link. O padrão é a de produção, a mesma do aviso de privacidade. */
  origem?: string;
  /** Quantas vezes espera um 429 antes de parar o canal neste lote. */
  esperasMaximas?: number;
  /** `retry_after` maior que isto não é esperado: o canal para até o próximo lote. */
  esperaMaximaSegundos?: number;
  /** Intervalo mínimo entre dois envios quaisquer (o teto do Telegram é ~30/s). */
  intervaloMs?: number;
  /** Intervalo mínimo entre dois envios para o mesmo chat (o teto do Telegram é 1/s). */
  intervaloPorChatMs?: number;
  /** Trocáveis nos testes. */
  esperar?: (ms: number) => Promise<void>;
  relogio?: () => number;
}

const esperarPadrao = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function telegramAvisoSender({
  api,
  origem = ORIGEM_SITE_PRODUCAO,
  esperasMaximas = 3,
  esperaMaximaSegundos = 30,
  intervaloMs = 40,
  intervaloPorChatMs = 1000,
  esperar = esperarPadrao,
  relogio = Date.now,
}: OpcoesDosAvisos): AvisoSender {
  let ultimoEnvio = -Infinity;
  const ultimoPorChat = new Map<number, number>();

  async function aguardarVez(chatId: number): Promise<void> {
    const livreEm = Math.max(
      ultimoEnvio + intervaloMs,
      (ultimoPorChat.get(chatId) ?? -Infinity) + intervaloPorChatMs,
    );
    const espera = livreEm - relogio();
    if (espera > 0) await esperar(espera);
    const agora = relogio();
    ultimoEnvio = agora;
    ultimoPorChat.set(chatId, agora);
    // O mapa só precisa do último segundo; sem isto ele cresceria com cada chat avisado.
    if (ultimoPorChat.size > 1000) {
      for (const [chat, quando] of ultimoPorChat) {
        if (agora - quando >= intervaloPorChatMs) ultimoPorChat.delete(chat);
      }
    }
  }

  async function enviarUma(envio: EnvioDeMensagem): Promise<number> {
    for (let esperas = 0; ; esperas++) {
      await aguardarVez(envio.chat_id);
      try {
        const mensagem = await api.chamar<{ message_id: number }>('sendMessage', envio);
        return mensagem.message_id;
      } catch (erro) {
        const classe = classificarErro(erro);
        const codigo = erro instanceof ErroDaApiDoTelegram ? erro.codigo : undefined;
        const motivo = `telegram:${codigo === undefined ? 'sem_resposta' : String(codigo)}`;
        // A descrição do Telegram não traz o chat nem o texto; o corpo da requisição não vai.
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        if (classe === 'permanente') {
          // 403: a pessoa bloqueou o bot ou apagou a conta. 400: chat inexistente, ou mensagem que
          // o Telegram nunca vai aceitar. Tentar de novo não muda nada para ela. Só o 403 perde o
          // chat: um 400 também pode ser defeito da mensagem, e o chat continua bom.
          throw new ErroDeEnvio(mensagem, motivo, true, false, codigo === 403);
        }
        const segundos = erro instanceof ErroDaApiDoTelegram ? erro.esperarSegundos : undefined;
        if (
          classe === 'esperar' &&
          esperas < esperasMaximas &&
          (segundos ?? 1) <= esperaMaximaSegundos
        ) {
          await esperar((segundos ?? 1) * 1000);
          continue;
        }
        // 429 longo, rede, 5xx: vale para o canal inteiro.
        throw new ErroDeEnvio(mensagem, motivo, false, true);
      }
    }
  }

  return {
    async enviar(aviso, destino) {
      const chatId = Number(destino);
      if (destino.trim() === '' || !Number.isSafeInteger(chatId)) {
        throw new ErroDeEnvio('chat id inválido', 'telefone_ilegivel', true, false);
      }
      let envios: EnvioDeMensagem[];
      try {
        envios = mensagensDoAviso(aviso, chatId, origem);
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        throw new ErroDeEnvio(mensagem, 'parametros_invalidos', true, false);
      }
      let ultima = 0;
      for (const envio of envios) ultima = await enviarUma(envio);
      return { id: `tg:${String(chatId)}:${String(ultima)}`, entregue: true };
    },
  };
}
