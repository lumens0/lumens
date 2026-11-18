/**
 * Junta eventos iguais seguidos (SCRUM-355). Quando várias pessoas saem de uma pauta de uma vez (o
 * agendador tira todos os responsáveis inativos na mesma rodada), cada saída é um `owner_removido`
 * com o mesmo papel, a mesma origem e o mesmo minuto: o evento não leva quem saiu (privacidade),
 * então as linhas ficam idênticas. A lista mostra uma linha com a quantidade.
 *
 * Só junta vizinhos: dois eventos iguais separados por outro acontecimento continuam separados, e
 * a ordem da lista não muda. O registro no banco não é tocado (é append-only).
 */
export interface EventoAgrupavel {
  tipo: string;
  dados: Record<string, unknown>;
  origem: string;
  criadoEm: Date;
}

export interface GrupoDeEventos<E extends EventoAgrupavel> {
  /** O primeiro evento do grupo, que dá a data e os detalhes. */
  evento: E;
  quantidade: number;
}

const minuto = (data: Date) => Math.floor(data.getTime() / 60_000);

const mesmoAcontecimento = (a: EventoAgrupavel, b: EventoAgrupavel) =>
  a.tipo === b.tipo &&
  a.origem === b.origem &&
  minuto(a.criadoEm) === minuto(b.criadoEm) &&
  JSON.stringify(a.dados) === JSON.stringify(b.dados);

export function agruparEventosIguais<E extends EventoAgrupavel>(eventos: E[]): GrupoDeEventos<E>[] {
  const grupos: GrupoDeEventos<E>[] = [];
  for (const evento of eventos) {
    const ultimo = grupos.at(-1);
    if (ultimo && mesmoAcontecimento(ultimo.evento, evento)) ultimo.quantidade += 1;
    else grupos.push({ evento, quantidade: 1 });
  }
  return grupos;
}
