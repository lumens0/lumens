import type { ApoioSemana, Conquista } from '@lumens/contratos';
import { diasEntre } from './dias';
import { totais } from './pautas-publicas';
import type { Pauta } from './tipos';

/** Etapas em que a gestão já foi cobrada ou respondeu: o que o Início chama de "em cobrança". */
const EM_COBRANCA = new Set(['cobrando', 'prometido', 'entregue_em_parte', 'descumprida']);

export interface NumerosDoInicio {
  abertas: number;
  juntandoApoios: number;
  apoios: number;
  /** Apoios da semana atual no campus todo; `null` quando o recorte é de blocos escolhidos. */
  apoiosNaSemana: number | null;
  /** Fatia dos apoios do campus que vem do recorte (0 a 100); `null` sem blocos escolhidos. */
  percentualDoCampus: number | null;
  emCobranca: number;
  descumpridas: number;
  conquistas: number;
  /** Média de dias da criação à entrega, arredondada; `null` sem conquista com datas. */
  diasAteEntrega: number | null;
}

/**
 * Os quatro números do Início (pautas abertas, apoios, em cobrança e conquistas) e o contexto de
 * cada um. `pautas` é o recorte da tela (blocos e etapas escolhidos); `campus` são as pautas do
 * campus inteiro, só para dizer que fatia dos apoios o recorte representa.
 */
export function numerosDoInicio({
  pautas,
  campus,
  semanas,
  conquistas,
  recortePorBloco,
}: {
  pautas: readonly Pauta[];
  campus: readonly Pauta[];
  semanas: readonly ApoioSemana[];
  /** Conquistas já limitadas ao recorte de blocos. */
  conquistas: readonly Conquista[];
  recortePorBloco: boolean;
}): NumerosDoInicio {
  const { abertas, apoios, conquistas: qtdConquistas } = totais(pautas);
  const apoiosDoCampus = totais(campus).apoios;
  const dias = conquistas
    .map((c) => diasEntre(c.criada_em, c.conquistada_em))
    .filter((n): n is number => n !== null);
  return {
    abertas,
    juntandoApoios: pautas.filter((p) => p.status === 'juntando_apoios').length,
    apoios,
    apoiosNaSemana: recortePorBloco ? null : (semanas.at(-1)?.apoios ?? 0),
    percentualDoCampus:
      recortePorBloco && apoiosDoCampus > 0 ? Math.round((apoios / apoiosDoCampus) * 100) : null,
    emCobranca: pautas.filter((p) => EM_COBRANCA.has(p.status)).length,
    descumpridas: pautas.filter((p) => p.status === 'descumprida').length,
    conquistas: qtdConquistas,
    diasAteEntrega:
      dias.length === 0 ? null : Math.round(dias.reduce((soma, n) => soma + n, 0) / dias.length),
  };
}

const plural = (n: number, um: string, varios: string) => `${String(n)} ${n === 1 ? um : varios}`;

/** Frases de contexto, uma por número, na ordem em que aparecem na tela. */
export function contextoDosNumeros(n: NumerosDoInicio): [string, string, string, string] {
  return [
    plural(n.juntandoApoios, 'juntando apoio', 'juntando apoios'),
    n.apoiosNaSemana !== null
      ? `+${String(n.apoiosNaSemana)} nesta semana`
      : n.percentualDoCampus !== null
        ? `${String(n.percentualDoCampus)}% dos apoios do campus`
        : 'Nenhum apoio ainda',
    n.descumpridas === 0
      ? 'Nenhuma promessa descumprida'
      : plural(n.descumpridas, 'promessa descumprida', 'promessas descumpridas'),
    n.diasAteEntrega === null
      ? 'Ainda nenhuma'
      : `${plural(n.diasAteEntrega, 'dia', 'dias')} em média até a entrega`,
  ];
}

/**
 * Pautas juntando apoios que estão mais perto da meta (apoios ÷ meta), as `limite` primeiras.
 * No empate, a que tem mais apoios e depois o título, para a ordem não mudar entre acessos.
 */
export function pertoDaMeta(pautas: readonly Pauta[], limite = 3): Pauta[] {
  return pautas
    .filter((p) => p.status === 'juntando_apoios' && p.meta > 0)
    .sort(
      (a, b) =>
        b.apoios / b.meta - a.apoios / a.meta ||
        b.apoios - a.apoios ||
        a.titulo.localeCompare(b.titulo, 'pt-BR'),
    )
    .slice(0, limite);
}
