import { ORIGEM_SITE_PRODUCAO } from '@lumens/contratos';
import type { AvisoRenderizado } from '../../envio/aviso';
import { ErroDeEnvio, type AvisoSender } from '../../envio/sender';
import { ErroDaEvolution, type ClienteEvolution } from './cliente';
import { tempoDigitando } from './respostas';

/**
 * Aberturas que variam de um aviso para outro. Mensagens idênticas em sequência são o padrão que
 * o WhatsApp mais associa a disparo em massa; o corpo continua o texto do catálogo.
 */
export const ABERTURAS = ['', 'Oi!', 'Olá!', 'Oi, tudo bem?', 'Olá, tudo certo?'] as const;

/**
 * O aviso como texto comum: sem modelo aprovado, os botões viram texto. O de link vira o endereço
 * da pauta; os de resposta rápida viram a lista do que a pessoa pode responder, nas mesmas formas
 * que a conversa aceita digitadas (veja `lumens_conferencia` em `modelos.ts`). Pura.
 *
 * @param origem origem do site, sem barra no fim.
 */
export function textoDoAviso(aviso: AvisoRenderizado, origem = ORIGEM_SITE_PRODUCAO): string {
  const linhas = [aviso.texto];
  const rapidas: string[] = [];
  for (const botao of aviso.botoes) {
    if (botao.tipo === 'URL') linhas.push(`${botao.texto}: ${origem}${botao.caminho}`);
    else rapidas.push(`*${botao.texto}*`);
  }
  if (rapidas.length > 0) linhas.push(`Responda ${juntar(rapidas)}.`);
  linhas.push(`_${aviso.modelo.rodape}_`);
  return linhas.join('\n\n');
}

/** "a", "a ou b", "a, b ou c". */
function juntar(itens: string[]): string {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} ou ${itens.at(-1) ?? ''}`;
}

export interface RitmoDosAvisos {
  /** Intervalo aleatório entre dois avisos, em ms. */
  intervaloMinMs: number;
  intervaloMaxMs: number;
  /** Origem do site no link da pauta. O padrão é a de produção. */
  origem?: string;
  /** Trocáveis nos testes. */
  esperar?: (ms: number) => Promise<void>;
  aleatorio?: () => number;
  agora?: () => number;
}

const dormir = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Avisos pela Evolution (SCRUM-275): o aviso vira texto comum (`textoDoAviso`), com uma abertura
 * sorteada, "digitando…" antes e um intervalo aleatório desde o aviso anterior.
 *
 * Quem decide quem recebe é a fila (`reservarLote` com `somenteComConversaDesde` e `maximo`):
 * aqui só se cuida do ritmo de cada envio. A entrega chega depois, pelo `messages.update` da
 * Evolution, que casa com o id devolvido aqui.
 */
export function avisosPelaEvolution(chamar: ClienteEvolution, ritmo: RitmoDosAvisos): AvisoSender {
  const esperar = ritmo.esperar ?? dormir;
  const aleatorio = ritmo.aleatorio ?? Math.random;
  const agora = ritmo.agora ?? Date.now;
  let ultimoEnvio: number | null = null;

  return {
    enviar: async (aviso, telefone) => {
      if (!/^\d{8,15}$/.test(telefone)) {
        throw new ErroDeEnvio('telefone inválido', 'telefone_ilegivel', true, false);
      }
      const abertura = ABERTURAS[Math.floor(aleatorio() * ABERTURAS.length)] ?? '';
      const corpo = textoDoAviso(aviso, ritmo.origem);
      const text = abertura === '' ? corpo : `${abertura}\n\n${corpo}`;

      if (ultimoEnvio !== null) {
        const intervalo =
          ritmo.intervaloMinMs + aleatorio() * (ritmo.intervaloMaxMs - ritmo.intervaloMinMs);
        const falta = ultimoEnvio + intervalo - agora();
        if (falta > 0) await esperar(Math.round(falta));
      }

      try {
        const resposta = (await chamar('/message/sendText', {
          number: telefone,
          text,
          delay: tempoDigitando(text),
          linkPreview: false,
        })) as { key?: { id?: unknown } } | null;
        const id = resposta?.key?.id;
        if (typeof id !== 'string' || id === '') {
          throw new ErroDaEvolution(null, 'resposta do envio sem o id da mensagem');
        }
        return { id, entregue: false };
      } finally {
        // Conta também o envio que falhou: a próxima tentativa respeita o mesmo intervalo.
        ultimoEnvio = agora();
      }
    },
  };
}
