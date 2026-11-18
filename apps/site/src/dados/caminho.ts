import { STATUS_PUBLICOS } from '@lumens/contratos';
import type { Pauta, StatusPauta } from './tipos';

export interface EtapaDoCaminho {
  status: StatusPauta;
  total: number;
  /** Largura da barra, de 0 a 100, em relação à etapa com mais pautas. */
  largura: number;
}

/**
 * Quantas pautas há em cada etapa pública, na ordem do caminho (de juntar apoios até conquistar).
 * Recebe a lista já filtrada por bloco, a mesma que alimenta os totais; pautas de status fora da
 * lista pública (curadoria, recusada) não entram. A etapa vazia aparece com zero, para o caminho
 * ter sempre a mesma forma.
 */
export function caminhoDasPautas(pautas: readonly Pauta[]): EtapaDoCaminho[] {
  const contagem = STATUS_PUBLICOS.map((status) => ({
    status,
    total: pautas.filter((pauta) => pauta.status === status).length,
  }));
  const maior = Math.max(0, ...contagem.map((etapa) => etapa.total));
  return contagem.map((etapa) => ({
    ...etapa,
    largura: maior === 0 ? 0 : Math.round((etapa.total / maior) * 100),
  }));
}

/** Frase para o leitor de tela e para o texto abaixo do gráfico. */
export function resumoDoCaminho(etapas: readonly EtapaDoCaminho[]): string {
  const total = etapas.reduce((soma, etapa) => soma + etapa.total, 0);
  if (total === 0) return 'Nenhuma pauta no caminho ainda.';
  const lider = etapas.reduce((a, b) => (b.total > a.total ? b : a));
  return `${String(total)} ${total === 1 ? 'pauta' : 'pautas'} no caminho; a etapa com mais pautas tem ${String(lider.total)}.`;
}
