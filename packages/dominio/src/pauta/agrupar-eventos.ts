/**
 * Junta eventos iguais seguidos na linha do tempo da curadoria (SCRUM-355). A regra mora em
 * `@lumens/contratos`, que o site também usa; aqui só se adapta ao `EventoDaLinha`.
 */
import { agruparEventosIguais as agrupar } from '@lumens/contratos';

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

export function agruparEventosIguais<E extends EventoAgrupavel>(eventos: E[]): GrupoDeEventos<E>[] {
  return agrupar(
    eventos,
    (e) => e.criadoEm,
    (e) => e.origem,
  );
}
export { rotuloDeResponsaveis } from '@lumens/contratos';
