import type { ResultadoRecusaDeFoto } from '@lumens/dominio';
import { comParametro, destinoDeVolta } from '../destino';
import { UUID } from '../pautas/[id]/decisoes';

export interface DependenciasDeRecusaDeFoto {
  /** Curador da sessão, conferido no banco. Sem ele nada é gravado. */
  curador: () => Promise<{ id: string } | undefined>;
  recusar: (fotoId: string, curadorId: string, motivo: string) => Promise<ResultadoRecusaDeFoto>;
}

/**
 * Recusar uma foto pela tela (5.3). Devolve para onde o navegador vai depois; a server action em
 * `acoes.ts` só redireciona. Separado dela para testar sem o Auth.js e o banco.
 */
export function criarRecusaDeFoto({ curador, recusar }: DependenciasDeRecusaDeFoto) {
  return async (fotoId: string, motivo: string, voltar: string): Promise<string> => {
    // A sessão é conferida aqui de novo: a action pode ser chamada direto, sem passar pela tela.
    const quem = await curador();
    if (!quem) return '/login';
    const destino = destinoDeVolta(voltar, '/relatos');
    if (!UUID.test(fotoId)) return destino;

    const resultado = await recusar(fotoId, quem.id, motivo);
    if (resultado.recusada) return comParametro(destino, 'feito', 'foto_recusada');
    return comParametro(destino, 'erro', `foto_${resultado.motivo}`);
  };
}
