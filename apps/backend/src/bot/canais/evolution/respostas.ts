import { decifrar, type Chaves } from '../../../cripto/cifra';
import type { Logger } from '../../../infra/logger';
import { resumoDoErro } from '../../../infra/logger';
import { respostasDoJob, type ReplySender } from '../../worker';
import { renderizarEmTexto } from '../menu-em-texto';
import type { ClienteEvolution } from './cliente';

/**
 * Quanto tempo o "digitando…" aparece antes de cada mensagem: proporcional ao tamanho, entre 1 e
 * 4 segundos. A Evolution mostra a presença durante o `delay` e só então envia.
 */
export function tempoDigitando(texto: string): number {
  return Math.min(4_000, Math.max(1_000, 600 + texto.length * 20));
}

/**
 * Respostas da conversa pela Evolution (SCRUM-275). Cada resposta sai na ordem:
 *
 * - texto ───────────▶ `sendText`;
 * - lista e botões ──▶ `sendText` com menu numerado (`renderizarEmTexto`); o worker guarda o menu
 *                      para traduzir o "2" de volta;
 * - imagem ──────────▶ `sendMedia` com o link e a legenda (o card da pauta, 2.9). Se a Evolution
 *                      não conseguir a imagem, vai só a legenda em texto, que leva o link — como no
 *                      Telegram.
 *
 * Sem pré-visualização de link: o aviso de privacidade leva o endereço do site já no primeiro
 * contato, e o card do link não ajuda ninguém a ler o aviso.
 *
 * Entrega pelo menos uma vez, como o worker de respostas: se uma resposta do meio falhar, o
 * retry manda de novo as anteriores.
 */
export function respostasPelaEvolution(
  chamar: ClienteEvolution,
  chaves: Chaves,
  logger?: Logger,
): ReplySender {
  const texto = (numero: string, text: string) =>
    chamar('/message/sendText', {
      number: numero,
      text,
      delay: tempoDigitando(text),
      linkPreview: false,
    });

  return {
    send: async (mensagem) => {
      const numero = decifrar(mensagem.phoneCifrado, chaves.cifra);
      for (const resposta of respostasDoJob(mensagem, chaves)) {
        if (typeof resposta !== 'string' && resposta.tipo === 'imagem') {
          try {
            await chamar('/message/sendMedia', {
              number: numero,
              mediatype: 'image',
              media: resposta.url,
              caption: resposta.legenda,
              delay: tempoDigitando(resposta.legenda),
            });
          } catch (erro) {
            logger?.warn(
              { erro: resumoDoErro(erro) },
              'card não foi como imagem; vai o link em texto',
            );
            await texto(numero, resposta.legenda);
          }
          continue;
        }
        await texto(numero, renderizarEmTexto(resposta));
      }
    },
  };
}
