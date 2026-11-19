'use client';

import { STATUS_PUBLICOS, type StatusPublico } from '@lumens/contratos';
import { useRouter } from 'next/navigation';
import { alternar } from '../../dados/filtros';
import type { BlocoDaFolha } from '../../dados/folha';
import {
  ORDENS,
  ROTULO_DA_ORDEM,
  urlDaLista,
  type Ordem,
  type ParametrosDaLista,
} from '../../dados/lista';
import type { Bloco } from '../../dados/tipos';
import { FolhaDeBlocos, type PautaDaFolha } from '../inicio/FolhaDeBlocos';
import { STATUS } from '../StatusPill';
import estilos from './lista.module.css';

/**
 * Os controles da lista que mudam a URL: as etapas (chips de seleção múltipla, `aria-pressed`), a
 * ordenação e a folha de blocos. A busca é um formulário comum, no servidor. Trocar filtro ou
 * ordem volta para a primeira página e mantém a busca.
 */
export function FiltrosDaLista({
  q,
  ordem,
  status,
  bloco,
  etapas,
  totalDaBusca,
  folha,
}: {
  q: string;
  ordem: Ordem;
  status: StatusPublico[];
  bloco: string[];
  /** Quantas pautas há em cada etapa dentro dos blocos e da busca escolhidos. */
  etapas: Record<StatusPublico, number>;
  /** Pautas dentro dos blocos e da busca, de qualquer etapa (o número do chip "Todas"). */
  totalDaBusca: number;
  folha: {
    blocos: BlocoDaFolha[];
    catalogo: Bloco[];
    siglas: Record<string, string>;
    pautas: PautaDaFolha[];
  };
}) {
  const router = useRouter();
  const ir = (mudanca: Partial<ParametrosDaLista>) => {
    router.replace(urlDaLista({ q, ordem, status, bloco, ...mudanca }), { scroll: false });
  };
  return (
    <div className={estilos.controles}>
      <ul className={estilos.chips} aria-label="Etapas">
        <li>
          <button
            type="button"
            className={estilos.chip}
            aria-pressed={status.length === 0}
            onClick={() => {
              ir({ status: [] });
            }}
          >
            Todas <span className={estilos.chipNumero}>{totalDaBusca}</span>
          </button>
        </li>
        {STATUS_PUBLICOS.filter((e) => etapas[e] > 0 || status.includes(e)).map((etapa) => (
          <li key={etapa}>
            <button
              type="button"
              className={estilos.chip}
              aria-pressed={status.includes(etapa)}
              onClick={() => {
                ir({ status: alternar(status, etapa) });
              }}
            >
              <i
                className={estilos.janelaMini}
                style={{ background: STATUS[etapa].ponto }}
                aria-hidden="true"
              />
              {STATUS[etapa].rotulo} <span className={estilos.chipNumero}>{etapas[etapa]}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className={estilos.linhaDeControles}>
        <FolhaDeBlocos
          base="/pautas"
          blocos={folha.blocos}
          catalogo={folha.catalogo}
          siglas={folha.siglas}
          pautas={folha.pautas}
          atual={{ status, bloco }}
          montarUrl={(escolhidos) => urlDaLista({ q, ordem, status, bloco: escolhidos })}
        />
        <label className={estilos.ordem}>
          Ordenar por
          <select
            value={ordem}
            onChange={(e) => {
              ir({ ordem: ORDENS.find((o) => o === e.target.value) ?? 'atencao' });
            }}
          >
            {ORDENS.map((o) => (
              <option key={o} value={o}>
                {ROTULO_DA_ORDEM[o]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
