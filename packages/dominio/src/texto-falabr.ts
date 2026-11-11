/**
 * Gerador do texto da manifestação no Fala.BR, a partir da pauta.
 *
 * O Fala.BR não tem API: o bot monta o texto, o owner copia e protocola na
 * mão. Isso tem duas consequências que moldam este módulo.
 *
 * A primeira é que o texto precisa sair pronto. Quem está do outro lado é um
 * estudante no WhatsApp, não alguém com um formulário aberto na frente: se o
 * bot devolver um rascunho para completar, o que chega à ouvidoria é o que a
 * pressa permitir.
 *
 * A segunda é que não há como voltar atrás. Protocolado, o texto é documento
 * público num sistema federal. Por isso o gerador **confere o próprio
 * resultado** contra a RN08 antes de entregar: título e descrição são escritos
 * por estudantes e podem citar nomes, e quem monta o texto é o último ponto em
 * que isso ainda dá para pegar.
 *
 * O veredicto vem junto em vez de virar exceção. Pauta com nome no título não
 * é caso excepcional, é caso comum — a resposta certa é mostrar ao owner o que
 * editar, e isso é fluxo normal, não erro de programa.
 *
 * **Relatos ficam fora do texto, de propósito.** São texto livre de muita
 * gente e o maior acúmulo de dado pessoal do sistema; a manifestação não
 * precisa deles, porque o peso coletivo já vem do número de apoios. Se a
 * equipe quiser os relatos no corpo, cada um terá de passar pela RN08
 * individualmente e isso é outra decisão, não um parâmetro deste módulo.
 */
import {
  type Achado,
  type OpcoesDeConferencia,
  type Veredicto,
  conferirAnonimato,
} from './anonimato';

export interface PautaParaTexto {
  titulo: string;
  descricao: string;
  /** Categoria da pauta, como a curadoria classificou. */
  categoria: string;
  /** Nome do bloco; `null` quando a pauta é do campus inteiro. */
  bloco: string | null;
  /** Apoios confirmados no momento da geração. */
  apoios: number;
  /** Meta de apoios da pauta (RN04). */
  meta: number;
}

export interface TextoFalaBr {
  /** O texto para o owner copiar no Fala.BR. */
  texto: string;
  /**
   * Conferência da RN08 sobre o texto gerado. Enquanto `anonimato.liberado`
   * for falso, este texto não pode ser protocolado.
   */
  anonimato: Veredicto;
}

/** Espaços colapsados e linhas em branco seguidas reduzidas a uma. */
function arrumarParagrafos(texto: string): string {
  return texto
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((linha) => linha.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function exigirTexto(valor: string, campo: string): string {
  const limpo = arrumarParagrafos(valor);
  if (limpo === '') {
    throw new RangeError(`${campo} vazio: não há manifestação a protocolar`);
  }
  return limpo;
}

function exigirInteiroNaoNegativo(valor: number, campo: string): void {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new RangeError(`${campo} inválido: ${String(valor)}`);
  }
}

/**
 * Monta o texto da manifestação e confere a RN08 sobre ele.
 *
 * Escreve na terceira pessoa e no plural: a manifestação é de um coletivo de
 * estudantes, e primeira pessoa do singular ("eu reclamo que") tanto
 * enfraquece o pedido quanto convida quem escreve a se identificar.
 *
 * Lança `RangeError` quando falta o essencial — título, descrição, ou números
 * de apoio que não fecham. Texto incompleto protocolado é pior do que
 * protocolo não aberto: ocupa o número, começa a contar o prazo e não diz o
 * que a universidade precisa responder.
 */
export function gerarTextoFalaBr(
  pauta: PautaParaTexto,
  opcoes: OpcoesDeConferencia = {},
): TextoFalaBr {
  const titulo = exigirTexto(pauta.titulo, 'titulo');
  const descricao = exigirTexto(pauta.descricao, 'descricao');
  const categoria = exigirTexto(pauta.categoria, 'categoria');

  exigirInteiroNaoNegativo(pauta.apoios, 'apoios');
  exigirInteiroNaoNegativo(pauta.meta, 'meta');
  if (pauta.meta === 0) {
    throw new RangeError('meta inválida: 0');
  }
  // Apoios acima da meta não é erro: a meta é o limiar que libera a cobrança,
  // não um teto, e o apoio continua aberto depois que ela bate.
  const relacaoComMeta = pauta.apoios > pauta.meta ? 'acima da meta' : 'de uma meta';

  const local = pauta.bloco === null ? 'Campus inteiro' : arrumarParagrafos(pauta.bloco);

  const texto = arrumarParagrafos(
    [
      `Assunto: ${titulo}`,
      '',
      `Categoria: ${categoria}`,
      `Local: ${local === '' ? 'Campus inteiro' : local}`,
      '',
      'Descrição',
      descricao,
      '',
      'Apoio',
      `Esta manifestação é apresentada coletivamente por ${String(pauta.apoios)} ` +
        `estudantes que registraram apoio a ela, ${relacaoComMeta} de ${String(pauta.meta)}.`,
      '',
      'Pedido',
      'Solicitamos posicionamento formal da universidade sobre o problema descrito, ' +
        'com indicação das providências previstas e do prazo para executá-las.',
    ].join('\n'),
  );

  return { texto, anonimato: conferirAnonimato(texto, opcoes) };
}

/**
 * Junta os trechos que se sobrepõem ou se encostam, em ordem. Dois nomes conhecidos podem se
 * cruzar ("Ana Maria Fernanda" e "Maria Fernanda Silva" em "Ana Maria Fernanda Silva"): trocados
 * um de cada vez, o segundo usaria posições que o primeiro já mudou, e apagaria texto que não é
 * nome — um "não" logo depois inverteria o sentido da manifestação.
 */
function intervalosUnidos(achados: readonly Achado[]): { inicio: number; fim: number }[] {
  const unidos: { inicio: number; fim: number }[] = [];
  for (const { inicio, fim } of [...achados].sort((a, b) => a.inicio - b.inicio)) {
    const ultimo = unidos.at(-1);
    if (ultimo !== undefined && inicio <= ultimo.fim) ultimo.fim = Math.max(ultimo.fim, fim);
    else unidos.push({ inicio, fim });
  }
  return unidos;
}

/** O que fica no lugar de um trecho com dado pessoal. */
export const MARCA_DE_REMOVIDO = '[removido]';

export interface TextoParaProtocolar {
  /** O texto que pode ir para o Fala.BR. Só vale quando `liberado`. */
  texto: string;
  /** Trechos com dado pessoal certo (bloqueio) que saíram do texto, trocados pela marca. */
  removidos: Achado[];
  /** Trechos que podem ser nome de pessoa (aviso): ficam no texto, para o owner conferir. */
  suspeitos: Achado[];
  /** Falso só se, depois de tirar os bloqueios, a conferência ainda bloquear. */
  liberado: boolean;
}

/**
 * Deixa o texto pronto para o owner protocolar (RN08, SCRUM-214).
 *
 * O que é certeza (e-mail, telefone, matrícula, nome conhecido) sai do texto: o owner não tem como
 * editar a pauta pelo bot, e o texto não pode ir com dado pessoal. O que é só suspeita fica, e vai
 * junto a lista para ele conferir antes de colar — tirar por heurística estragaria pauta legítima.
 *
 * Depois de tirar, confere de novo: se ainda houver bloqueio, `liberado` sai falso e o texto não
 * deve ser entregue.
 */
export function prepararParaProtocolar(
  gerado: TextoFalaBr,
  opcoes: OpcoesDeConferencia = {},
): TextoParaProtocolar {
  const removidos = gerado.anonimato.achados.filter((a) => a.severidade === 'bloqueio');

  // De trás para a frente: trocar um trecho não muda a posição dos que vêm antes dele.
  let texto = gerado.texto;
  for (const { inicio, fim } of intervalosUnidos(removidos).reverse()) {
    texto = texto.slice(0, inicio) + MARCA_DE_REMOVIDO + texto.slice(fim);
  }

  const depois = conferirAnonimato(texto, opcoes);
  return {
    texto,
    removidos,
    suspeitos: depois.achados.filter((a) => a.severidade === 'aviso'),
    liberado: depois.liberado,
  };
}
