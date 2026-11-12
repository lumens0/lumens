import { MODELOS, type ModeloMensagem, type NomeModelo } from '../whatsapp/modelos';

/**
 * Um aviso da fila já conferido contra o catálogo de modelos (`whatsapp/modelos.ts`), pronto para
 * qualquer canal. O texto vem de um lugar só, o catálogo: o WhatsApp manda o nome do modelo e as
 * variáveis (a Meta monta o texto aprovado), e o Telegram manda o mesmo corpo já preenchido.
 *
 * Os `parametros` do disparo seguem a ordem do modelo (SCRUM-193): primeiro as variáveis do corpo,
 * depois uma por botão de link — hoje só o slug do "Ver a pauta". Os botões de resposta rápida
 * levam um `payload` com o tipo e o aviso do disparo, para o bot saber a que conferência um "Sim"
 * responde quando a pessoa tem mais de uma aberta.
 */
export interface AvisoRenderizado {
  modelo: ModeloMensagem;
  /** Valores das variáveis do corpo, na ordem (`{{1}}`, `{{2}}`...). */
  variaveis: string[];
  /** O corpo do modelo com as variáveis preenchidas: o que a pessoa lê. */
  texto: string;
  /** Na ordem do modelo; `indice` é a posição do botão no modelo aprovado. */
  botoes: BotaoDoAviso[];
}

export type BotaoDoAviso =
  | {
      tipo: 'URL';
      indice: number;
      texto: string;
      /** O `{{1}}` do caminho: o slug, como vai para a Meta. */
      valor: string;
      /** O caminho já preenchido, como `/p/{slug}`. A origem é de quem envia. */
      caminho: string;
    }
  | { tipo: 'QUICK_REPLY'; indice: number; texto: string; payload: string };

/** O disparo não casa com o modelo aprovado: a Meta recusaria, e tentar de novo não muda isso. */
export class ParametrosInvalidosError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'ParametrosInvalidosError';
  }
}

const VARIAVEL = /\{\{(\d+)\}\}/g;

const quantasVariaveis = (texto: string) =>
  new Set([...texto.matchAll(VARIAVEL)].map((m) => m[1])).size;

/** Payload da resposta rápida: `tipo:aviso:índice do botão`. */
export const payloadDaResposta = (disparo: { tipo: string; aviso: string }, indice: number) =>
  `${disparo.tipo}:${disparo.aviso}:${String(indice)}`;

/** Confere o disparo contra o modelo e preenche o texto. Pura. Lança `ParametrosInvalidosError`. */
export function renderizarAviso(disparo: {
  tipo: string;
  aviso: string;
  modelo: string;
  parametros: readonly string[];
}): AvisoRenderizado {
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

  const variaveis = disparo.parametros.slice(0, noCorpo);
  // Função, não string: um `$&` no título da pauta não pode virar padrão de substituição.
  const texto = modelo.corpo.replace(VARIAVEL, (_, n: string) => variaveis[Number(n) - 1] ?? '');

  let proximoLink = noCorpo;
  const botoes = modelo.botoes.map((botao, indice): BotaoDoAviso => {
    if (botao.tipo === 'URL') {
      const valor = disparo.parametros[proximoLink++] ?? '';
      return {
        tipo: 'URL',
        indice,
        texto: botao.texto,
        valor,
        caminho: botao.caminho.replace('{{1}}', encodeURIComponent(valor)),
      };
    }
    return {
      tipo: 'QUICK_REPLY',
      indice,
      texto: botao.texto,
      payload: payloadDaResposta(disparo, indice),
    };
  });

  return { modelo, variaveis, texto, botoes };
}
