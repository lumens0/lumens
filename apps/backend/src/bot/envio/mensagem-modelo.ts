import { MODELOS, type NomeModelo } from '../whatsapp/modelos';

/**
 * Corpo do envio de uma mensagem modelo pela Cloud API (`POST /{phone-number-id}/messages`).
 *
 * Os `parametros` do disparo seguem a ordem do modelo (SCRUM-193): primeiro as variáveis do corpo,
 * depois uma por botão de link — hoje só o slug do "Ver a pauta". Os botões de resposta rápida
 * levam um `payload` com o tipo e o aviso do disparo, para o bot saber a que conferência um "Sim"
 * responde quando a pessoa tem mais de uma aberta.
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

/** O disparo não casa com o modelo aprovado: a Meta recusaria, e tentar de novo não muda isso. */
export class ParametrosInvalidosError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'ParametrosInvalidosError';
  }
}

const quantasVariaveis = (texto: string) =>
  new Set([...texto.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;

export function montarMensagemModelo(
  disparo: { tipo: string; aviso: string; modelo: string; parametros: readonly string[] },
  telefone: string,
): MensagemModelo {
  if (!(disparo.modelo in MODELOS)) {
    throw new ParametrosInvalidosError(`modelo desconhecido: ${disparo.modelo}`);
  }
  const modelo = MODELOS[disparo.modelo as NomeModelo];

  const noCorpo = quantasVariaveis(modelo.corpo);
  const links = modelo.botoes.filter((b) => b.tipo === 'URL').length;
  if (disparo.parametros.length !== noCorpo + links) {
    throw new ParametrosInvalidosError(
      `${modelo.nome} espera ${String(noCorpo + links)} parâmetros, veio ${String(disparo.parametros.length)}`,
    );
  }
  if (disparo.parametros.some((p) => p.trim() === '')) {
    // A Meta recusa variável vazia (erro 132000/100), e o aviso sairia sem sentido.
    throw new ParametrosInvalidosError(`${modelo.nome} com parâmetro vazio`);
  }

  const components: ComponenteDeEnvio[] = [
    {
      type: 'body',
      parameters: disparo.parametros
        .slice(0, noCorpo)
        .map((text) => ({ type: 'text' as const, text })),
    },
  ];
  let proximoLink = noCorpo;
  modelo.botoes.forEach((botao, i) => {
    if (botao.tipo === 'URL') {
      const text = disparo.parametros[proximoLink++] ?? '';
      components.push({
        type: 'button',
        sub_type: 'url',
        index: String(i),
        parameters: [{ type: 'text', text }],
      });
    } else {
      components.push({
        type: 'button',
        sub_type: 'quick_reply',
        index: String(i),
        parameters: [{ type: 'payload', payload: `${disparo.tipo}:${disparo.aviso}:${String(i)}` }],
      });
    }
  });

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefone,
    type: 'template',
    template: { name: modelo.nome, language: { code: modelo.idioma }, components },
  };
}
