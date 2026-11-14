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

export interface OpcaoDoMenu {
  id: string;
  titulo: string;
}

/** As opções do último menu mandado a uma conversa, na ordem em que foram numeradas. */
export interface MenuEmTexto {
  opcoes: OpcaoDoMenu[];
}

export const DICA_DO_MENU = 'Responda com o número da opção.';

/** As opções de uma resposta interativa, ou `null` para texto e imagem. */
export function menuDaResposta(resposta: Resposta): MenuEmTexto | null {
  if (typeof resposta === 'string' || resposta.tipo === 'imagem') return null;
  const opcoes = resposta.tipo === 'lista' ? resposta.linhas : resposta.botoes;
  return { opcoes: opcoes.map(({ id, titulo }) => ({ id, titulo })) };
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
 * Tira o menu principal (`menuPrincipal`, o `MENU_TEXT`) que venha depois de um menu numerado.
 * O router o acrescenta quando um fluxo termina no menu, e no "Vou ajudar" isso acontece logo
 * depois dos botões. Com botões nativos não há confusão; em texto seriam duas numerações seguidas
 * e o "1" ficaria ambíguo. As opções desses botões são comandos globais (`ajudar <id>`, `menu`),
 * que valem a partir do menu, então nada se perde.
 */
export function semMenuPrincipalDepoisDoMenu(
  respostas: readonly Resposta[],
  menuPrincipal: string,
): Resposta[] {
  let depoisDeMenu = false;
  return respostas.filter((resposta) => {
    if (menuDaResposta(resposta) !== null) depoisDeMenu = true;
    return !(depoisDeMenu && resposta === menuPrincipal);
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
  return [resposta.corpo, '', ...linhas, '', DICA_DO_MENU].join('\n');
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
  if (/^\d+$/.test(digitado)) {
    return menu.opcoes[Number(digitado) - 1]?.id ?? null;
  }
  // Título cortado pelos limites da Meta termina em "…"; quem digita não escreve as reticências.
  const semReticencias = (titulo: string) => normalize(titulo.replace(/…$/u, ''));
  return menu.opcoes.find((o) => semReticencias(o.titulo) === digitado)?.id ?? null;
}
