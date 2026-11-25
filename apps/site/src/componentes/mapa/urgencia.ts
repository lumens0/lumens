import type { Bloco, Pauta, StatusPauta } from '../../dados/tipos';
import { STATUS } from '../StatusPill';
import { PREDIOS } from './predios';

/** A luz de cada status vem do StatusPill: o mapa e os cards falam a mesma cor. */
const COR: Record<Exclude<StatusPauta, 'em_curadoria' | 'recusada' | 'conquistada'>, string> = {
  juntando_apoios: STATUS.juntando_apoios.ponto,
  meta_batida: STATUS.meta_batida.ponto,
  cobrando: STATUS.cobrando.ponto,
  prometido: STATUS.prometido.ponto,
  entregue_em_parte: STATUS.entregue_em_parte.ponto,
  descumprida: STATUS.descumprida.ponto,
};
const SO_CONQUISTAS = STATUS.conquistada.ponto;
// Apagado: dá para ver que o prédio é um bloco, sem competir com os acesos (SCRUM-284).
const SEM_PAUTAS = '#6f7597';

export const LEGENDA = [
  { cor: COR.juntando_apoios, rotulo: 'Juntando apoios' },
  { cor: COR.meta_batida, rotulo: 'Meta batida' },
  // Cada etapa da cobrança tem a sua cor (SCRUM-317): a legenda mostra as três.
  { cor: COR.cobrando, rotulo: 'Cobrando' },
  { cor: COR.prometido, rotulo: 'Prometido' },
  { cor: COR.entregue_em_parte, rotulo: 'Entregue em parte' },
  { cor: COR.descumprida, rotulo: 'Promessa descumprida' },
  { cor: SO_CONQUISTAS, rotulo: 'Só conquistas' },
  { cor: SEM_PAUTAS, rotulo: 'Sem pautas' },
] as const;

/** Rótulo do status mais urgente na linha do bloco, como no protótipo. */
const ROTULO: Record<keyof typeof COR, string> = {
  juntando_apoios: 'Juntando apoios',
  meta_batida: 'Meta batida',
  cobrando: 'Cobrando quem decide',
  prometido: 'Prometido',
  entregue_em_parte: 'Entregue em parte',
  descumprida: 'Promessa descumprida',
};

/** Peso de urgência (RF-S10): descumprida primeiro; depois o que está sendo cobrado. */
const PESO: Record<keyof typeof COR, number> = {
  descumprida: 6,
  cobrando: 5,
  prometido: 5,
  entregue_em_parte: 5,
  meta_batida: 4,
  juntando_apoios: 3,
};

const aberta = (p: Pauta): p is Pauta & { status: keyof typeof COR } => p.status in COR;

/** A pauta aberta mais urgente; no empate, a de mais apoios. Conquistada não conta como aberta. */
export function maisUrgente(
  pautas: readonly Pauta[],
): (Pauta & { status: keyof typeof COR }) | undefined {
  return pautas
    .filter(aberta)
    .sort(
      (a, b) =>
        Number(b.urgente) - Number(a.urgente) ||
        PESO[b.status] - PESO[a.status] ||
        b.apoios - a.apoios,
    )[0];
}

export interface MarcadorDoBloco {
  slug: string;
  nome: string;
  /** Id do prédio no desenho; `undefined` para bloco que ainda não tem prédio ligado a ele. */
  predio: number | undefined;
  abertas: number;
  cor: string;
  urgente: boolean;
  /** "2 pautas abertas · Cobrando quem decide · 1 conquista", ou "Nenhuma pauta aberta". */
  linha: string;
  /** Pautas do bloco para o painel ao lado do mapa: abertas primeiro, a mais urgente no topo. */
  pautas: Pauta[];
  /** Cursos que apoiam e abrem pauta aqui (SCRUM-399); vazio: aberto a qualquer estudante verificado. */
  cursos?: readonly string[];
}

const plural = (n: number, um: string, varios: string) => `${String(n)} ${n === 1 ? um : varios}`;

/** Um marcador por bloco, com a cor da pauta mais urgente dele, na ordem em que os blocos vêm. */
export function marcadoresDoMapa(
  blocos: readonly Bloco[],
  pautas: readonly Pauta[],
): MarcadorDoBloco[] {
  const marcadores = blocos.map((bloco) =>
    marcador(
      bloco.slug,
      bloco.nome,
      pautas,
      PREDIOS.find((p) => p.blocos.includes(bloco.slug))?.id,
      bloco.cursos ?? [],
    ),
  );
  // Pauta sem bloco é do campus inteiro e não tem prédio: sem esta linha ela sumia do mapa.
  if (pautas.some((p) => p.bloco_slug === null)) {
    marcadores.push(marcador(SLUG_DO_CAMPUS, 'Todo o campus', pautas, undefined, []));
  }
  return marcadores;
}

/** Slug do marcador das pautas sem bloco; os de bloco de verdade nunca têm essa forma. */
export const SLUG_DO_CAMPUS = '_campus';

function marcador(
  slug: string,
  nome: string,
  pautas: readonly Pauta[],
  predio: number | undefined,
  cursos: readonly string[],
): MarcadorDoBloco {
  const doBloco = pautas.filter((p) =>
    slug === SLUG_DO_CAMPUS ? p.bloco_slug === null : p.bloco_slug === slug,
  );
  const abertas = doBloco
    .filter(aberta)
    .sort(
      (a, b) =>
        Number(b.urgente) - Number(a.urgente) ||
        PESO[b.status] - PESO[a.status] ||
        b.apoios - a.apoios,
    );
  const conquistadas = doBloco.filter((p) => p.status === 'conquistada');
  const topo = abertas[0];
  const partes = topo
    ? [plural(abertas.length, 'pauta aberta', 'pautas abertas'), ROTULO[topo.status]]
    : ['Nenhuma pauta aberta'];
  if (conquistadas.length > 0) partes.push(plural(conquistadas.length, 'conquista', 'conquistas'));
  return {
    slug,
    nome,
    predio,
    abertas: abertas.length,
    cor: topo ? COR[topo.status] : conquistadas.length > 0 ? SO_CONQUISTAS : SEM_PAUTAS,
    urgente: abertas.some((p) => p.urgente),
    linha: partes.join(' · '),
    pautas: [...abertas, ...conquistadas],
    cursos,
  };
}
