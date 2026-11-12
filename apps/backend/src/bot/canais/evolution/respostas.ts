import { decifrar, type Chaves } from '../../../cripto/cifra';
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
 * Respostas da conversa pela Evolution (SCRUM-275). Cada resposta sai como texto, na ordem; lista
 * e botões viram menu numerado (`renderizarEmTexto`), e o worker guarda o menu para traduzir o
 * "2" de volta.
 *
 * Sem pré-visualização de link: o aviso de privacidade leva o endereço do site já no primeiro
 * contato, e o card do link não ajuda ninguém a ler o aviso.
 *
 * Entrega pelo menos uma vez, como o worker de respostas: se uma resposta do meio falhar, o
 * retry manda de novo as anteriores.
 */
export function respostasPelaEvolution(chamar: ClienteEvolution, chaves: Chaves): ReplySender {
  return {
    send: async (mensagem) => {
      const numero = decifrar(mensagem.phoneCifrado, chaves.cifra);
      for (const resposta of respostasDoJob(mensagem, chaves)) {
        const text = renderizarEmTexto(resposta);
        await chamar('/message/sendText', {
          number: numero,
          text,
          delay: tempoDigitando(text),
          linkPreview: false,
        });
      }
    },
  };
}
