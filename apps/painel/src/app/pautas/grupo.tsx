import Link from 'next/link';
import estilos from '../painel.module.css';

/** Agrupa itens da fila por pauta, na ordem em que a pauta aparece pela primeira vez. */
export function agruparPorPauta<T extends { pautaId: string; pautaTitulo: string }>(
  itens: readonly T[],
): { pautaId: string; titulo: string; itens: T[] }[] {
  const grupos = new Map<string, { pautaId: string; titulo: string; itens: T[] }>();
  for (const item of itens) {
    const grupo = grupos.get(item.pautaId) ?? {
      pautaId: item.pautaId,
      titulo: item.pautaTitulo,
      itens: [],
    };
    grupo.itens.push(item);
    grupos.set(item.pautaId, grupo);
  }
  return [...grupos.values()];
}

/** "1 relato", "3 pedidos": o selo de quantidade do cabeçalho de cada pauta. */
export function seloDeQuantidade(n: number, um: string, varios: string): string {
  return `${String(n)} ${n === 1 ? um : varios}`;
}

/**
 * Cabeçalho de uma pauta numa fila (Relatos e Pedidos): uma faixa grossa separa a pauta da
 * seguinte; rótulo "Pauta", título (link), onde é, e à direita o selo com quantos itens esperam.
 */
export function CabecalhoDaPauta({
  pautaId,
  titulo,
  onde,
  selo,
}: {
  pautaId: string;
  titulo: string;
  /** Bloco da pauta, quando a fila sabe. */
  onde?: string;
  selo: string;
}) {
  return (
    <header className={estilos.grupoDaPauta}>
      <div className={estilos.grupoTexto}>
        <span className={estilos.grupoRotulo}>Pauta</span>
        <h2>
          <Link href={`/pautas/${pautaId}`}>{titulo}</Link>
        </h2>
        {onde !== undefined && <p className={estilos.grupoOnde}>{onde}</p>}
      </div>
      <span className={estilos.grupoSelo}>{selo}</span>
    </header>
  );
}
