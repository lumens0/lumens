import type { ResultadoDecisaoDePedido } from '@lumens/dominio';
import { comParametro, destinoDeVolta } from '../destino';
import { UUID } from '../pautas/[id]/decisoes';

export interface DependenciasDeDecisaoDePedido {
  /** Curador da sessão, conferido no banco. Sem ele nada é gravado. */
  curador: () => Promise<{ id: string } | undefined>;
  aprovar: (
    pedidoId: string,
    curadorId: string,
    depoisVisto: string,
  ) => Promise<ResultadoDecisaoDePedido>;
  recusar: (
    pedidoId: string,
    curadorId: string,
    motivo: string,
  ) => Promise<ResultadoDecisaoDePedido>;
}

/**
 * Aprovar ou recusar um pedido de edição pela tela. Devolve para onde o navegador vai depois; as
 * server actions em `acoes.ts` só redirecionam. Separado delas para testar sem o Auth.js e o banco.
 */
export function criarDecisoesDePedido({
  curador,
  aprovar,
  recusar,
}: DependenciasDeDecisaoDePedido) {
  async function decidir(
    pedidoId: string,
    voltar: string,
    agir: (curadorId: string) => Promise<ResultadoDecisaoDePedido>,
    feito: 'edicao_aprovada' | 'edicao_recusada',
  ): Promise<string> {
    // A sessão é conferida aqui de novo: a action pode ser chamada direto, sem passar pela tela.
    const quem = await curador();
    if (!quem) return '/login';
    const destino = destinoDeVolta(voltar, '/pedidos');
    if (!UUID.test(pedidoId)) return destino;

    const resultado = await agir(quem.id);
    return resultado.decidido
      ? comParametro(destino, 'feito', feito)
      : comParametro(destino, 'erro', `edicao_${resultado.motivo}`);
  }

  return {
    /** `depoisVisto`: o texto novo que a tela mostrava; se o pedido não for mais esse, nada muda. */
    aprovar: (pedidoId: string, depoisVisto: string, voltar: string) =>
      decidir(pedidoId, voltar, (c) => aprovar(pedidoId, c, depoisVisto), 'edicao_aprovada'),
    recusar: (pedidoId: string, motivo: string, voltar: string) =>
      decidir(pedidoId, voltar, (c) => recusar(pedidoId, c, motivo), 'edicao_recusada'),
  };
}
