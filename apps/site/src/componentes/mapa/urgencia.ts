import type { Pauta, StatusPauta } from '../../dados/tipos';
import { PREDIOS, type Predio } from './predios';

/**
 * Do mais urgente para o menos (RF-S10): promessa descumprida e cobrança sem resposta pedem
 * atenção primeiro; conquista e entrega em parte, por último. Em curadoria e recusada nem chegam
 * ao site.
 */
export const ORDEM_DE_URGENCIA: readonly StatusPauta[] = [
  'descumprida',
  'cobrando',
  'meta_batida',
  'prometido',
  'juntando_apoios',
  'entregue_em_parte',
  'conquistada',
];

const posicao = (status: StatusPauta) => {
  const i = ORDEM_DE_URGENCIA.indexOf(status);
  return i === -1 ? ORDEM_DE_URGENCIA.length : i;
};

/** A pauta mais urgente: a de status mais urgente; no empate, a de mais apoios. */
export function maisUrgente(pautas: readonly Pauta[]): Pauta | undefined {
  return pautas.reduce<Pauta | undefined>((atual, p) => {
    if (!atual) return p;
    const diferenca = posicao(p.status) - posicao(atual.status);
    return diferenca < 0 || (diferenca === 0 && p.apoios > atual.apoios) ? p : atual;
  }, undefined);
}

export interface Lugar {
  /** O prédio no mapa; `undefined` para bloco que ainda não tem desenho. */
  predio: Predio | undefined;
  nome: string;
  pautas: Pauta[];
  urgente: Pauta | undefined;
}

/**
 * Agrupa as pautas por prédio. Bloco que não está no desenho vira um lugar só da lista; pauta de
 * todo o campus (sem bloco) fica de fora do mapa e vai num lugar próprio, "Todo o campus".
 */
export function lugaresDoMapa(pautas: readonly Pauta[]): Lugar[] {
  const porPredio = new Map<number, Pauta[]>();
  const semPredio = new Map<string, { nome: string; pautas: Pauta[] }>();
  const doCampus: Pauta[] = [];

  for (const pauta of pautas) {
    if (!pauta.bloco_slug) {
      doCampus.push(pauta);
      continue;
    }
    const slug = pauta.bloco_slug;
    const predio = PREDIOS.find((p) => p.blocos.includes(slug));
    if (predio) porPredio.set(predio.id, [...(porPredio.get(predio.id) ?? []), pauta]);
    else {
      const lugar = semPredio.get(slug) ?? { nome: pauta.bloco_nome ?? slug, pautas: [] };
      lugar.pautas.push(pauta);
      semPredio.set(slug, lugar);
    }
  }

  const lugares: Lugar[] = PREDIOS.map((predio) => {
    const lista = porPredio.get(predio.id) ?? [];
    return { predio, nome: predio.nome, pautas: lista, urgente: maisUrgente(lista) };
  });
  for (const { nome, pautas: lista } of semPredio.values())
    lugares.push({ predio: undefined, nome, pautas: lista, urgente: maisUrgente(lista) });
  if (doCampus.length > 0)
    lugares.push({
      predio: undefined,
      nome: 'Todo o campus',
      pautas: doCampus,
      urgente: maisUrgente(doCampus),
    });
  // A lista começa pelo lugar mais urgente; o mapa não depende da ordem.
  return lugares.sort(
    (a, b) =>
      urgenciaDe(a.urgente) - urgenciaDe(b.urgente) ||
      (b.urgente?.apoios ?? 0) - (a.urgente?.apoios ?? 0),
  );
}

const urgenciaDe = (p: Pauta | undefined) => (p ? posicao(p.status) : ORDEM_DE_URGENCIA.length + 1);
