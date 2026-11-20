import Link from 'next/link';
import type { CSSProperties } from 'react';
import estilos from '../painel.module.css';
import { COR_NO_PAINEL, STATUS } from './status';

/** Agrupa itens da fila por pauta, na ordem em que a pauta aparece pela primeira vez. */
export function agruparPorPauta<
  T extends {
    pautaId: string;
    pautaTitulo: string;
    pautaBloco?: string | null;
    pautaStatus?: keyof typeof STATUS;
  },
>(
  itens: readonly T[],
): {
  pautaId: string;
  titulo: string;
  bloco: string | null | undefined;
  status: keyof typeof STATUS | undefined;
  itens: T[];
}[] {
  const grupos = new Map<
    string,
    {
      pautaId: string;
      titulo: string;
      bloco: string | null | undefined;
      status: keyof typeof STATUS | undefined;
      itens: T[];
    }
  >();
  for (const item of itens) {
    const grupo = grupos.get(item.pautaId) ?? {
      pautaId: item.pautaId,
      titulo: item.pautaTitulo,
      bloco: item.pautaBloco,
      status: item.pautaStatus,
      itens: [],
    };
    grupo.itens.push(item);
    grupos.set(item.pautaId, grupo);
  }
  return [...grupos.values()];
}

/** "1 relato", "3 pedidos": a quantidade escrita, para o selo do cabeçalho de cada pauta. */
export function seloDeQuantidade(n: number, um: string, varios: string): string {
  return `${String(n)} ${n === 1 ? um : varios}`;
}

/**
 * Cabeçalho de uma pauta numa fila (Relatos e Pedidos): uma faixa grossa separa a pauta da
 * seguinte; a janela na cor da etapa, o rótulo "Pauta", o título (link), "etapa · bloco" e, à
 * direita, quantos itens esperam.
 */
export function CabecalhoDaPauta({
  pautaId,
  titulo,
  status,
  onde,
  quantidade,
  um,
  varios,
}: {
  pautaId: string;
  titulo: string;
  status?: keyof typeof STATUS | undefined;
  /** Bloco da pauta, quando a fila sabe. */
  onde?: string | undefined;
  quantidade: number;
  um: string;
  varios: string;
}) {
  const meta = [status === undefined ? undefined : STATUS[status], onde]
    .filter((parte): parte is string => parte !== undefined)
    .join(' · ');
  return (
    <header className={estilos.grupoCabecalho}>
      <i
        className={[estilos.glifo, status === 'descumprida' ? estilos.glifoVazado : ''].join(' ')}
        style={{ '--c': COR_NO_PAINEL[status ?? 'juntando_apoios'] } as CSSProperties}
        aria-hidden="true"
      />
      <div className={estilos.grupoTexto}>
        <p className={estilos.grupoRotulo}>Pauta</p>
        <h2>
          <Link href={`/pautas/${pautaId}`}>{titulo}</Link>
        </h2>
        {meta !== '' && <p className={estilos.grupoOnde}>{meta}</p>}
      </div>
      <span className={estilos.grupoSelo}>
        <b>{quantidade}</b> {quantidade === 1 ? um : varios}
      </span>
    </header>
  );
}
