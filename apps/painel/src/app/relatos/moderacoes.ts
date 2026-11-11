import type { ResultadoModeracao } from '@lumens/dominio';
import { UUID } from '../pautas/[id]/decisoes';

export interface DependenciasDeModeracao {
  /** Curador da sessão, conferido no banco. Sem ele nada é gravado. */
  curador: () => Promise<{ id: string } | undefined>;
  aprovar: (relatoId: string, curadorId: string) => Promise<ResultadoModeracao>;
  recusar: (relatoId: string, curadorId: string) => Promise<ResultadoModeracao>;
}

/**
 * Aprovar e recusar relatos pela tela (5.3). Cada função devolve para onde o navegador vai depois;
 * as server actions em `acoes.ts` só redirecionam. Separado delas para testar sem o Auth.js e o banco.
 */
export function criarModeracoes({ curador, aprovar, recusar }: DependenciasDeModeracao) {
  async function moderar(
    relatoId: string,
    agir: (curadorId: string) => Promise<ResultadoModeracao>,
    feito: 'aprovado' | 'recusado',
  ): Promise<string> {
    // A sessão é conferida aqui de novo: a action pode ser chamada direto, sem passar pela tela.
    const quem = await curador();
    if (!quem) return '/login';
    if (!UUID.test(relatoId)) return '/relatos';

    const resultado = await agir(quem.id);
    if (resultado.moderado) return `/relatos?feito=${feito}`;
    return resultado.motivo === 'relato_inexistente'
      ? '/relatos'
      : `/relatos?erro=${resultado.motivo}`;
  }

  return {
    aprovar: (relatoId: string) => moderar(relatoId, (c) => aprovar(relatoId, c), 'aprovado'),
    recusar: (relatoId: string) => moderar(relatoId, (c) => recusar(relatoId, c), 'recusado'),
  };
}
