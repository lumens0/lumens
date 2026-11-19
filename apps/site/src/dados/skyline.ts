import type { StatusPublico } from '@lumens/contratos';
import { PREDIOS, siglaDe } from '../componentes/mapa/predios';
import type { Bloco, Pauta } from './tipos';

/** Quantos prédios o skyline mostra de uma vez. */
export const PREDIOS_NO_SKYLINE = 5;
/** Quantos prédios de blocos escolhidos podem entrar à esquerda de uma vez. */
const MAXIMO_DE_ENTRADAS = 3;

// Do mais urgente ao menos: a janela acesa que cabe primeiro é a que mais pede atenção.
const PRIORIDADE: readonly StatusPublico[] = [
  'descumprida',
  'cobrando',
  'prometido',
  'meta_batida',
  'entregue_em_parte',
  'juntando_apoios',
  'conquistada',
];

export interface JanelaDoPredio {
  slug: string;
  titulo: string;
  status: StatusPublico;
  apoios: number;
  urgente: boolean;
  /** Fora da etapa filtrada: a janela continua no prédio, mais apagada. */
  fora: boolean;
}

export interface PredioDoSkyline {
  slug: string;
  nome: string;
  sigla: string;
  colunas: number;
  linhas: number;
  /** As pautas que cabem nas janelas, as mais urgentes primeiro. */
  janelas: JanelaDoPredio[];
  /** Pautas que não couberam nas janelas ("+N"). */
  mais: number;
  escolhido: boolean;
  /** Pautas do prédio na etapa filtrada (todas, sem filtro de etapa). */
  pautas: number;
}

/** Sigla do bloco: a do prédio no mapa, quando há, ou a derivada do nome. */
export function siglaDoBloco(bloco: Pick<Bloco, 'slug' | 'nome'>): string {
  const predio = PREDIOS.find((p) => p.sigla !== '' && p.blocos.includes(bloco.slug));
  return abreviar(predio?.sigla ?? siglaDe(bloco.nome));
}

/** Cabe embaixo de um prédio: "Bloco 18" vira "B18", "Novo CTEC" vira "CTEC", o resto, iniciais. */
export function abreviar(nome: string): string {
  const bloco = /^Bloco (\S+)$/.exec(nome);
  if (bloco) return `B${bloco[1] ?? ''}`;
  if (nome.length <= 6) return nome;
  const palavras = nome.split(/\s+/);
  const ultima = palavras.at(-1) ?? '';
  if (/^[A-ZÀ-Ú0-9]{2,}$/.test(ultima)) return ultima;
  return palavras
    .filter((p) => p.length >= 3)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

/** Tamanho do prédio pelo número de estudantes do bloco: de 2 a 3 colunas, de 3 a 6 linhas. */
export function tamanhoDoPredio(baseEstudantes: number): { colunas: number; linhas: number } {
  return {
    colunas: baseEstudantes >= 3000 ? 3 : 2,
    linhas: Math.min(6, 3 + Math.floor(baseEstudantes / 1000)),
  };
}

const ABERTA = (status: StatusPublico) => status !== 'conquistada' && status !== 'descumprida';

function ordemDasJanelas(a: JanelaDoPredio, b: JanelaDoPredio): number {
  return (
    Number(b.urgente) - Number(a.urgente) ||
    PRIORIDADE.indexOf(a.status) - PRIORIDADE.indexOf(b.status) ||
    b.apoios - a.apoios ||
    a.titulo.localeCompare(b.titulo, 'pt-BR')
  );
}

/**
 * Os prédios do skyline: os `maximo` blocos com mais pautas abertas (desempate por apoios e nome),
 * da esquerda para a direita. Bloco escolhido que não está entre eles entra à esquerda (no máximo
 * `MAXIMO_DE_ENTRADAS`) e tira, da direita para a esquerda, prédios não escolhidos.
 */
export function montarSkyline({
  blocos,
  pautas,
  escolhidos,
  status,
  maximo = PREDIOS_NO_SKYLINE,
}: {
  blocos: readonly Bloco[];
  pautas: readonly Pauta[];
  escolhidos: readonly string[];
  status: readonly StatusPublico[];
  maximo?: number;
}): PredioDoSkyline[] {
  const resumo = blocos.map((bloco) => {
    const doBloco = pautas.filter((p) => p.bloco_slug === bloco.slug);
    return {
      bloco,
      doBloco,
      abertas: doBloco.filter((p) => ABERTA(p.status as StatusPublico)).length,
      apoios: doBloco.reduce((soma, p) => soma + p.apoios, 0),
    };
  });
  const ranque = [...resumo].sort(
    (a, b) =>
      b.abertas - a.abertas ||
      b.apoios - a.apoios ||
      a.bloco.nome.localeCompare(b.bloco.nome, 'pt-BR'),
  );
  let exibidos = ranque.slice(0, maximo);
  const entradas = ranque
    .filter((r) => escolhidos.includes(r.bloco.slug) && !exibidos.includes(r))
    .slice(0, MAXIMO_DE_ENTRADAS);
  for (const entrada of entradas.reverse()) {
    const sai = [...exibidos].reverse().find((r) => !escolhidos.includes(r.bloco.slug));
    exibidos = [entrada, ...exibidos.filter((r) => r !== sai)];
    if (exibidos.length > maximo) exibidos = exibidos.slice(0, maximo);
  }
  return exibidos.map(({ bloco, doBloco }) => {
    const { colunas, linhas } = tamanhoDoPredio(bloco.base_estudantes);
    const todas = doBloco
      .map<JanelaDoPredio>((p) => ({
        slug: p.slug,
        titulo: p.titulo,
        status: p.status as StatusPublico,
        apoios: p.apoios,
        urgente: p.urgente,
        fora: status.length > 0 && !status.includes(p.status as StatusPublico),
      }))
      .sort(ordemDasJanelas);
    const capacidade = colunas * linhas;
    return {
      slug: bloco.slug,
      nome: bloco.nome,
      sigla: siglaDoBloco(bloco),
      colunas,
      linhas,
      janelas: todas.slice(0, capacidade),
      mais: Math.max(0, todas.length - capacidade),
      escolhido: escolhidos.includes(bloco.slug),
      pautas: todas.filter((j) => !j.fora).length,
    };
  });
}

const plural = (n: number, um: string, varios: string) => `${String(n)} ${n === 1 ? um : varios}`;

function lista(itens: readonly string[]): string {
  if (itens.length <= 1) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} e ${itens.at(-1) ?? ''}`;
}

/**
 * Frase da legenda do skyline. Sem blocos escolhidos, o convite a tocar numa janela. Com blocos,
 * cita todos os escolhidos (com as pautas na etapa filtrada) e os que ainda não têm pauta.
 */
export function legendaDoSkyline(escolhidos: readonly { nome: string; pautas: number }[]): string {
  if (escolhidos.length === 0) return 'Cada janela acesa é uma pauta. Toque numa para ver qual.';
  const comPauta = escolhidos.filter((b) => b.pautas > 0);
  const semPauta = escolhidos.filter((b) => b.pautas === 0);
  const partes = [];
  if (comPauta.length > 0) {
    partes.push(
      `${comPauta.length === 1 ? 'Bloco escolhido' : 'Blocos escolhidos'}: ${comPauta
        .map((b) => `${b.nome} (${plural(b.pautas, 'pauta', 'pautas')})`)
        .join(', ')}.`,
    );
  }
  if (semPauta.length > 0) {
    const nomes = lista(semPauta.map((b) => b.nome));
    partes.push(
      semPauta.length === 1
        ? `${nomes} ainda não tem pauta e aparece apagado.`
        : `${nomes} ainda não têm pautas e aparecem apagados.`,
    );
  }
  return partes.join(' ');
}
