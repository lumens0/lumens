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
const SEM_PAUTAS = '#9ea2b8';

export const LEGENDA = [
  { cor: COR.juntando_apoios, rotulo: 'Juntando apoios' },
  { cor: COR.meta_batida, rotulo: 'Meta batida' },
  { cor: COR.cobrando, rotulo: 'Cobrando ou prometida' },
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
    .sort((a, b) => PESO[b.status] - PESO[a.status] || b.apoios - a.apoios)[0];
}

export interface MarcadorDoBloco {
  slug: string;
  nome: string;
  /** Id do prédio no desenho; `undefined` para bloco que ainda não tem prédio ligado a ele. */
  predio: number | undefined;
  abertas: number;
  cor: string;
  /** "2 pautas abertas · Cobrando quem decide · 1 conquista", ou "Nenhuma pauta aberta". */
  linha: string;
  /** Pautas do bloco para o painel ao lado do mapa: abertas primeiro, a mais urgente no topo. */
  pautas: Pauta[];
}

const plural = (n: number, um: string, varios: string) => `${String(n)} ${n === 1 ? um : varios}`;

/** Um marcador por bloco, com a cor da pauta mais urgente dele, na ordem em que os blocos vêm. */
export function marcadoresDoMapa(
  blocos: readonly Bloco[],
  pautas: readonly Pauta[],
): MarcadorDoBloco[] {
  return blocos.map((bloco) => {
    const doBloco = pautas.filter((p) => p.bloco_slug === bloco.slug);
    const abertas = doBloco
      .filter(aberta)
      .sort((a, b) => PESO[b.status] - PESO[a.status] || b.apoios - a.apoios);
    const conquistadas = doBloco.filter((p) => p.status === 'conquistada');
    const topo = abertas[0];
    const partes = topo
      ? [plural(abertas.length, 'pauta aberta', 'pautas abertas'), ROTULO[topo.status]]
      : ['Nenhuma pauta aberta'];
    if (conquistadas.length > 0)
      partes.push(plural(conquistadas.length, 'conquista', 'conquistas'));
    return {
      slug: bloco.slug,
      nome: bloco.nome,
      predio: PREDIOS.find((p) => p.blocos.includes(bloco.slug))?.id,
      abertas: abertas.length,
      cor: topo ? COR[topo.status] : conquistadas.length > 0 ? SO_CONQUISTAS : SEM_PAUTAS,
      linha: partes.join(' · '),
      pautas: [...abertas, ...conquistadas],
    };
  });
}
