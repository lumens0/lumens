/**
 * Menus para canais sem lista nem botão nativos (SCRUM-275).
 *
 * A conversa responde com `MensagemDeLista` e `MensagemDeBotoes` (veja `resposta.ts`). Num canal
 * que só manda texto, cada opção vira uma linha numerada. Quando a pessoa responde "2" ou digita
 * o título da opção, `resolverEscolha` devolve o `id` dela — o mesmo que o webhook da Meta
 * entregaria com `interactive.list_reply` ou `button_reply`. A conversa recebe o mesmo input
 * nos dois canais e não sabe qual dos dois está em uso.
 *
 * Nada aqui é específico de um canal: qualquer canal só de texto usa estas funções.
 */
import { normalize } from '../conversation/texto';
import type { Resposta } from '../conversation/resposta';
import { ehMenuPrincipal } from '../conversation/handlers';

export interface OpcaoDoMenu {
  id: string;
  titulo: string;
  /** A saída acrescentada pelo canal: só o "0" e o título a escolhem, nunca um número da lista. */
  saida?: true;
}

/** As opções do último menu mandado a uma conversa, na ordem em que foram numeradas. */
export interface MenuEmTexto {
  opcoes: OpcaoDoMenu[];
}

export const DICA_DO_MENU = 'Responda com o número da opção.';

/** A saída que todo menu numerado ganha (menos o principal): o `menu` global do router. */
export const OPCAO_VOLTAR = { id: 'menu', titulo: 'Voltar ao menu principal' } as const;

/** O menu não precisa da saída extra: é o principal, ou já tem uma opção que volta ao menu. */
function jaTemSaida(resposta: Resposta, opcoes: readonly OpcaoDoMenu[]): boolean {
  return ehMenuPrincipal(resposta) || opcoes.some((o) => o.id === OPCAO_VOLTAR.id);
}

/** As opções de uma resposta interativa, ou `null` para texto e imagem. */
export function menuDaResposta(resposta: Resposta): MenuEmTexto | null {
  if (typeof resposta === 'string' || resposta.tipo === 'imagem') return null;
  const opcoes = (resposta.tipo === 'lista' ? resposta.linhas : resposta.botoes).map(
    ({ id, titulo }) => ({ id, titulo }),
  );
  // A opção 0 não aparece na numeração: vale a qualquer hora, em `resolverEscolha`.
  return {
    opcoes: jaTemSaida(resposta, opcoes)
      ? opcoes
      : [...opcoes, { ...OPCAO_VOLTAR, saida: true as const }],
  };
}

/**
 * O menu que vale para a próxima mensagem da pessoa: o da última resposta interativa do turno.
 * Um turno sem resposta interativa não deixa menu, e "2" volta a ser só "2".
 */
export function menuDoTurno(respostas: readonly Resposta[]): MenuEmTexto | null {
  for (let i = respostas.length - 1; i >= 0; i--) {
    const resposta = respostas[i];
    if (resposta === undefined) continue;
    const menu = menuDaResposta(resposta);
    if (menu !== null) return menu;
  }
  return null;
}

/**
 * Tira o menu principal (`MENU_PRINCIPAL`) que venha depois de um menu numerado.
 * O router o acrescenta quando um fluxo termina no menu, e no "Vou ajudar" isso acontece logo
 * depois dos botões. Com botões nativos não há confusão; em texto seriam duas numerações seguidas
 * e o "1" ficaria ambíguo. As opções desses botões são comandos globais (`ajudar <id>`, `menu`),
 * que valem a partir do menu, então nada se perde.
 */
export function semMenuPrincipalDepoisDoMenu(
  respostas: readonly Resposta[],
  ehMenuPrincipal: (resposta: Resposta) => boolean,
): Resposta[] {
  let depoisDeMenu = false;
  return respostas.filter((resposta) => {
    if (depoisDeMenu && ehMenuPrincipal(resposta)) return false;
    if (menuDaResposta(resposta) !== null) depoisDeMenu = true;
    return true;
  });
}

/**
 * A resposta como texto: lista e botões viram linhas numeradas. A imagem vira a legenda, que já
 * leva o link da pauta; é o que vai quando o canal não consegue mandar a imagem.
 */
export function renderizarEmTexto(resposta: Resposta): string {
  if (typeof resposta === 'string') return resposta;
  if (resposta.tipo === 'imagem') return resposta.legenda;
  const linhas =
    resposta.tipo === 'lista'
      ? resposta.linhas.map(
          (l, i) =>
            `*${String(i + 1)}.* ${l.titulo}${l.descricao === undefined ? '' : ` — ${l.descricao}`}`,
        )
      : resposta.botoes.map((b, i) => `*${String(i + 1)}.* ${b.titulo}`);
  const opcoes = resposta.tipo === 'lista' ? resposta.linhas : resposta.botoes;
  // Saída que todo menu numerado ganha, para quem se perdeu no meio do fluxo.
  const saida = jaTemSaida(resposta, opcoes) ? [] : [`*0.* ${OPCAO_VOLTAR.titulo}`];
  return [resposta.corpo, '', ...linhas, ...saida, '', DICA_DO_MENU].join('\n');
}

/**
 * O `id` da opção escolhida, ou `null` quando o texto não escolhe nenhuma (aí a conversa recebe o
 * texto como veio). Vale o número da linha ("2", "2.", "2)") ou o título, sem diferença de caixa
 * nem de acento.
 */
export function resolverEscolha(texto: string, menu: MenuEmTexto | null): string | null {
  if (menu === null || menu.opcoes.length === 0) return null;
  const digitado = normalize(texto);
  if (digitado === '') return null;
  const numero = numeroDigitado(digitado);
  if (numero !== null) {
    // O 0 é a saída; os outros números contam a partir da primeira linha.
    if (numero === 0) return menu.opcoes.find((o) => o.id === OPCAO_VOLTAR.id)?.id ?? null;
    // Só as linhas que a pessoa viu numeradas: "4" num menu de 3 não é a saída.
    return menu.opcoes.filter((o) => o.saida !== true)[numero - 1]?.id ?? null;
  }
  // Título cortado pelos limites da Meta termina em "…"; quem digita não escreve as reticências.
  const semReticencias = (titulo: string) => normalize(titulo.replace(/…$/u, ''));
  return menu.opcoes.find((o) => semReticencias(o.titulo) === digitado)?.id ?? null;
}

const POR_EXTENSO: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  primeiro: 1,
  primeira: 1,
  dois: 2,
  duas: 2,
  segundo: 2,
  segunda: 2,
  tres: 3,
  terceiro: 3,
  terceira: 3,
  quatro: 4,
  quarto: 4,
  quarta: 4,
  cinco: 5,
  quinto: 5,
  quinta: 5,
  seis: 6,
  sexto: 6,
  sexta: 6,
  sete: 7,
  setimo: 7,
  oito: 8,
  oitavo: 8,
  nove: 9,
  nono: 9,
  dez: 10,
  decimo: 10,
};

/**
 * O número que o texto diz: "2", "2.", "2)", "dois", "opção 2", "a segunda", "número três". Já vem
 * sem acento e em minúsculas (`normalize`). `null` quando o texto não é só um número.
 */
function numeroDigitado(digitado: string): number | null {
  const sem = digitado
    .replace(/^(a |o )?(opcao|numero|item|n)(\s+|(?=\d))/, '')
    .replace(/^(a |o )/, '')
    .replace(/[.)\-:]+$/, '')
    .trim();
  if (/^\d{1,2}$/.test(sem)) return Number(sem);
  return POR_EXTENSO[sem] ?? null;
}
