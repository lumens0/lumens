'use client';

import { STATUS_PUBLICOS, type StatusPublico } from '@lumens/contratos';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { statusDaUrl } from '../../dados/filtros';
import { absorver, chaveDe, limparGrupo, proximaEscolha } from '../../dados/pendentes';
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
  const chave = chaveDe({ status, bloco });
  useEffect(() => {
    absorver({ status, bloco });
    // `status` e `bloco` mudam de identidade a cada render do servidor; a chave diz se mudou o conteúdo.
  }, [chave]);
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
              const p = limparGrupo({ status, bloco }, 'status');
              ir({ status: [], bloco: p.bloco });
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
                // Parte da escolha pendente (dois cliques antes de a página refletir não se perdem).
                const p = proximaEscolha({ status, bloco }, 'status', etapa);
                ir({ status: statusDaUrl(p.status.join(',')), bloco: [...p.bloco] });
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
