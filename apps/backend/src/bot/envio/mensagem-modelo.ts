import { ORIGEM_SITE_PRODUCAO } from '@lumens/contratos';
import { renderizarAviso, type AvisoRenderizado } from './aviso';

export { ParametrosInvalidosError } from './aviso';

/**
 * Corpo do envio de uma mensagem modelo pela Cloud API (`POST /{phone-number-id}/messages`).
 *
 * A conferência do disparo contra o modelo e a ordem dos parâmetros ficam em `renderizarAviso`
 * (`aviso.ts`), que o Telegram também usa. Aqui só o formato da Meta: o nome do modelo, as
 * variáveis do corpo, o slug de cada botão de link e o `payload` de cada resposta rápida.
 */
export interface MensagemModelo {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: { code: string };
    components: ComponenteDeEnvio[];
  };
}

type ComponenteDeEnvio =
  | { type: 'header'; parameters: { type: 'image'; image: { link: string } }[] }
  | { type: 'body'; parameters: { type: 'text'; text: string }[] }
  | {
      type: 'button';
      sub_type: 'url';
      index: string;
      parameters: { type: 'text'; text: string }[];
    }
  | {
      type: 'button';
      sub_type: 'quick_reply';
      index: string;
      parameters: { type: 'payload'; payload: string }[];
    };

/**
 * Monta o corpo da Cloud API de um aviso já conferido. Pura.
 *
 * @param origem origem pública do site, sem barra no fim: a imagem do cabeçalho (o card) vai por
 *   link, e a Meta baixa de lá. O padrão é a de produção, a mesma do botão aprovado.
 */
export function mensagemModeloDe(
  aviso: AvisoRenderizado,
  telefone: string,
  origem: string = ORIGEM_SITE_PRODUCAO,
): MensagemModelo {
  const components: ComponenteDeEnvio[] = [];
  if (aviso.imagem !== undefined) {
    components.push({
      type: 'header',
      parameters: [{ type: 'image', image: { link: origem + aviso.imagem.caminho } }],
    });
  }
  components.push({
    type: 'body',
    parameters: aviso.variaveis.map((text) => ({ type: 'text' as const, text })),
  });
  for (const botao of aviso.botoes) {
    components.push(
      botao.tipo === 'URL'
        ? {
            type: 'button',
            sub_type: 'url',
            index: String(botao.indice),
            parameters: [{ type: 'text', text: botao.valor }],
          }
        : {
            type: 'button',
            sub_type: 'quick_reply',
            index: String(botao.indice),
            parameters: [{ type: 'payload', payload: botao.payload }],
          },
    );
  }

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefone,
    type: 'template',
    template: {
      name: aviso.modelo.nome,
      language: { code: aviso.modelo.idioma },
      components,
    },
  };
}

/** Confere o disparo e monta o corpo da Cloud API. Lança `ParametrosInvalidosError`. */
export function montarMensagemModelo(
  disparo: { tipo: string; aviso: string; modelo: string; parametros: readonly string[] },
  telefone: string,
  origem?: string,
): MensagemModelo {
  return mensagemModeloDe(renderizarAviso(disparo), telefone, origem);
}
