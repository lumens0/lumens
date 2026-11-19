import type { Caminho, PautaDetalhe } from '@lumens/contratos';

/** Quando a pauta virou conquista: o último evento de status para `conquistada`. */
export function conquistadaEm(pauta: PautaDetalhe): string | undefined {
  return pauta.linha_do_tempo.findLast(
    (evento) => evento.tipo === 'status_alterado' && evento.dados.para === 'conquistada',
  )?.criado_em;
}

/** A solução da comunidade que foi executada, se a pauta teve uma. */
export function solucaoEntregue(pauta: PautaDetalhe): Caminho | undefined {
  return pauta.caminhos.findLast(
    (caminho) =>
      caminho.tipo === 'proposta' && (caminho.status === 'executada' || caminho.executada_em),
  );
}
