'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type CSSProperties } from 'react';
import { urlDeFiltros, type Escolhas } from '../../dados/filtros';
import { absorver, chaveDe, proximaEscolha } from '../../dados/pendentes';
import type { StatusPauta } from '../../dados/tipos';
import { STATUS } from '../StatusPill';
import estilos from './inicio.module.css';

function useAlternar(atual: Escolhas) {
  const router = useRouter();
  const chaveAtual = chaveDe(atual);
  useEffect(() => {
    absorver(atual);
    // `atual` muda de identidade a cada render do servidor; a chave diz se o conteúdo mudou.
  }, [chaveAtual]);
  return (grupo: 'status' | 'bloco', valor: string) => {
    router.replace(urlDeFiltros('/', proximaEscolha(atual, grupo, valor)), { scroll: false });
  };
}

export interface LinhaDeEtapa {
  status: StatusPauta;
  total: number;
  /** Largura da barra, de 0 a 100. */
  largura: number;
}

/**
 * "Em que etapa estão": cada linha é um filtro de seleção múltipla (`aria-pressed`). A etapa
 * aparece com o número em texto; a barra é só reforço, então a cor nunca é o único sinal.
 */
export function EtapasFiltraveis({ linhas, atual }: { linhas: LinhaDeEtapa[]; atual: Escolhas }) {
  const alternarFiltro = useAlternar(atual);
  return (
    <ul className={estilos.linhasFiltro}>
      {linhas.map((linha) => (
        <li key={linha.status}>
          <button
            type="button"
            className={estilos.linhaFiltro}
            aria-pressed={atual.status.includes(linha.status)}
            style={{ '--cor': STATUS[linha.status].ponto } as CSSProperties}
            onClick={() => {
              alternarFiltro('status', linha.status);
            }}
          >
            <span className={estilos.nomeDaLinha}>
              <i className={estilos.janelaMini} aria-hidden="true" />
              {STATUS[linha.status].rotulo}
            </span>
            <span className={estilos.trilhoDaLinha} aria-hidden="true">
              <i style={{ width: `${String(linha.largura)}%` }} />
            </span>
            <span className={estilos.valorDaLinha}>{linha.total}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export interface LinhaDeBloco {
  slug: string;
  nome: string;
  apoios: number;
  largura: number;
}

/** "Blocos mais ativos": cada linha liga ou desliga um bloco no filtro, com os apoios em texto. */
export function BlocosFiltraveis({ linhas, atual }: { linhas: LinhaDeBloco[]; atual: Escolhas }) {
  const alternarFiltro = useAlternar(atual);
  return (
    <ul className={estilos.linhasFiltro}>
      {linhas.map((linha) => (
        <li key={linha.slug}>
          <button
            type="button"
            className={estilos.linhaFiltro}
            aria-pressed={atual.bloco.includes(linha.slug)}
            onClick={() => {
              alternarFiltro('bloco', linha.slug);
            }}
          >
            <span className={estilos.nomeDaLinha}>{linha.nome}</span>
            <span className={estilos.trilhoDaLinha} aria-hidden="true">
              <i style={{ width: `${String(linha.largura)}%` }} />
            </span>
            <span className={estilos.valorDaLinha}>{linha.apoios}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
