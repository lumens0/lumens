import type { ResultadoDecisao } from '@lumens/dominio';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DependenciasDeDecisao {
  /** Curador da sessão, conferido no banco. Sem ele nada é gravado. */
  curador: () => Promise<{ id: string } | undefined>;
  aprovar: (pautaId: string, curadorId: string) => Promise<ResultadoDecisao>;
  recusar: (pautaId: string, curadorId: string, motivo: string) => Promise<ResultadoDecisao>;
}

/**
 * Aprovar e recusar pela tela (5.2). Cada função devolve para onde o navegador vai depois; as
 * server actions em `acoes.ts` só redirecionam. Separado delas para testar sem o Auth.js e o banco.
 */
export function criarDecisoes({ curador, aprovar, recusar }: DependenciasDeDecisao) {
  async function decidir(
    pautaId: string,
    agir: (curadorId: string) => Promise<ResultadoDecisao>,
    feito: 'aprovada' | 'recusada',
  ): Promise<string> {
    // A sessão é conferida aqui de novo: a action pode ser chamada direto, sem passar pela tela.
    const quem = await curador();
    if (!quem) return '/login';
    if (!UUID.test(pautaId)) return '/fila';

    const resultado = await agir(quem.id);
    if (resultado.decidida) return `/fila?feito=${feito}`;
    return resultado.motivo === 'pauta_inexistente'
      ? '/fila'
      : `/pautas/${pautaId}?erro=${resultado.motivo}`;
  }

  return {
    aprovar: (pautaId: string) => decidir(pautaId, (c) => aprovar(pautaId, c), 'aprovada'),
    recusar: (pautaId: string, motivo: string) =>
      decidir(pautaId, (c) => recusar(pautaId, c, motivo), 'recusada'),
  };
}
