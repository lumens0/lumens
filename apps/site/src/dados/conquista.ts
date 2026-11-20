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

/** O que foi feito, para o card, a página da pauta e /conquistas (SCRUM-394). */
export interface OQueFoiFeito {
  /** O texto da curadoria; sem ele, a descrição do caminho executado (só na pauta, que a tem). */
  texto: string | null;
  /** Chave da foto da curadoria (`fotos/AAAA/MM/<uuid>.jpg`); `null` sem foto. */
  foto: string | null;
}

export function oQueFoiFeito(
  pauta: Pick<PautaDetalhe, 'o_que_foi_feito' | 'foto' | 'caminhos'>,
): OQueFoiFeito {
  const daCuradoria = pauta.o_que_foi_feito?.trim();
  const doCaminho = solucaoEntregue(pauta as PautaDetalhe)?.descricao?.trim();
  return { texto: daCuradoria || doCaminho || null, foto: pauta.foto };
}
