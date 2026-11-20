'use client';

import { STATUS_PUBLICOS, type StatusPublico } from '@lumens/contratos';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { statusDaUrl } from '../../dados/filtros';
import {
  absorver,
  chaveDe,
  absorverOrdem,
  escolhaVigente,
  limparGrupo,
  ordemVigente,
  proximaEscolha,
  registrarOrdem,
} from '../../dados/pendentes';
import { buscarNaFolha, type BlocoDaFolha } from '../../dados/folha';
import {
  ORDENS,
  ordemDaUrl,
  ROTULO_DA_ORDEM,
  urlDaLista,
  type Ordem,
  type ParametrosDaLista,
} from '../../dados/lista';
import { STATUS } from '../StatusPill';
import estilos from './lista.module.css';

/** Espera depois da última tecla antes de buscar: a lista acompanha a digitação sem uma ida por letra. */
const ESPERA_DA_BUSCA_MS = 250;

/**
 * Os controles da lista, na ordem do protótipo: busca (a lista filtra enquanto se digita) e
 * ordenação, sugestões de bloco, as etapas (chips de seleção múltipla, `aria-pressed`), os blocos
 * (a lista abre aqui mesmo, e a busca também filtra os blocos) e os filtros ativos. Trocar filtro,
 * busca ou ordem volta para a primeira página.
 */
export function FiltrosDaLista({
  q,
  ordem,
  status,
  bloco,
  etapas,
  totalDaBusca,
  blocos,
  totalDeBlocos,
  sugestoes,
  ativos,
}: {
  q: string;
  ordem: Ordem;
  status: StatusPublico[];
  bloco: string[];
  /** Quantas pautas há em cada etapa dentro dos blocos e da busca escolhidos. */
  etapas: Record<StatusPublico, number>;
  /** Pautas dentro dos blocos e da busca, de qualquer etapa (o número do chip "Todas"). */
  totalDaBusca: number;
  /** Todos os blocos do campus, com as pautas de cada um, para a lista de blocos. */
  blocos: BlocoDaFolha[];
  totalDeBlocos: number;
  /** "Filtrar pelo bloco: X" (o servidor sabe o que casa com a busca). */
  sugestoes: ReactNode;
  /** Os filtros ativos, com o "×" que tira cada um. */
  ativos: ReactNode;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState(q);
  const [blocosAbertos, setBlocosAbertos] = useState(false);
  const enviado = useRef(q);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chave = `${chaveDe({ status, bloco })}|${ordem}`;
  useEffect(() => {
    absorver({ status, bloco });
    absorverOrdem(ordem);
    // `status` e `bloco` mudam de identidade a cada render do servidor; a chave diz se mudou o conteúdo.
  }, [chave]);
  useEffect(() => {
    // Busca que chegou de fora (por exemplo, "Limpar tudo"): o campo acompanha. A que a própria
    // pessoa digitou e já enviou não o reescreve no meio da digitação.
    if (q !== enviado.current) {
      enviado.current = q;
      setTexto(q);
      // Uma busca digitada e ainda não enviada vale menos que a mudança de fora: sem isto, o
      // temporizador reaplicaria o termo que a navegação acabou de remover.
      if (espera.current) clearTimeout(espera.current);
    }
  }, [q]);
  useEffect(
    () => () => {
      if (espera.current) clearTimeout(espera.current);
    },
    [],
  );
  const ir = (mudanca: Partial<ParametrosDaLista>) => {
    // Parte da escolha vigente (a pendente, se ainda vale): mudar a ordem logo depois de escolher uma
    // etapa ou um bloco não descarta o filtro que a página ainda não refletiu.
    const vigente = escolhaVigente({ status, bloco });
    router.replace(
      urlDaLista({
        // A busca enviada por último, e não a que a página ainda mostra: depois de buscar e antes de a
        // resposta chegar, trocar a etapa, o bloco ou a ordem não pode derrubar a busca.
        q: enviado.current,
        ordem: ordemDaUrl(ordemVigente(ordem)),
        status: statusDaUrl(vigente.status.join(',')),
        bloco: [...vigente.bloco],
        ...mudanca,
      }),
      { scroll: false },
    );
  };
  const buscar = (valor: string) => {
    setTexto(valor);
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => {
      const busca = valor.trim();
      enviado.current = busca;
      ir({ q: busca });
    }, ESPERA_DA_BUSCA_MS);
  };
  const visiveis = buscarNaFolha(blocos, texto);
  return (
    <div className={estilos.filtros}>
      <div className={estilos.busca}>
        <form role="search" action="/pautas" method="get" className={estilos.campoDeBusca}>
          <label>
            <span className={estilos.somenteLeitor}>Buscar pauta ou bloco</span>
            <input
              type="search"
              name="q"
              value={texto}
              placeholder="Buscar pauta ou bloco"
              autoComplete="off"
              onChange={(e) => {
                buscar(e.target.value);
              }}
            />
          </label>
          {status.length > 0 && <input type="hidden" name="status" value={status.join(',')} />}
          {bloco.length > 0 && <input type="hidden" name="bloco" value={bloco.join(',')} />}
          {ordem !== 'atencao' && <input type="hidden" name="ordem" value={ordem} />}
        </form>
        <label className={estilos.ordem}>
          <span>Ordenar por</span>
          <select
            value={ordem}
            onChange={(e) => {
              const nova = ORDENS.find((o) => o === e.target.value) ?? 'atencao';
              registrarOrdem(nova);
              ir({ ordem: nova });
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

      {sugestoes}

      <div>
        <p className={estilos.rotuloDoGrupo}>Etapa</p>
        <ul className={[estilos.chips, estilos.rolagem].join(' ')} aria-label="Etapas">
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
              Todas <b className={estilos.chipNumero}>{totalDaBusca}</b>
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
                {STATUS[etapa].rotulo} <b className={estilos.chipNumero}>{etapas[etapa]}</b>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className={estilos.rotuloDoGrupo}>Bloco</p>
        <button
          type="button"
          className={estilos.maisBlocos}
          aria-expanded={blocosAbertos}
          aria-controls="painel-de-blocos"
          onClick={() => {
            setBlocosAbertos((agora) => !agora);
          }}
        >
          {blocosAbertos
            ? 'Fechar a lista de blocos'
            : `Escolher entre os ${String(totalDeBlocos)} blocos`}
        </button>
        <div id="painel-de-blocos" className={estilos.painelDeBlocos} hidden={!blocosAbertos}>
          <ul
            className={[estilos.chips, estilos.quebra].join(' ')}
            aria-label="Todos os blocos do campus"
          >
            {visiveis.map((b) => (
              <li key={b.slug}>
                <button
                  type="button"
                  className={estilos.chip}
                  aria-pressed={bloco.includes(b.slug)}
                  title={b.nome}
                  onClick={() => {
                    const p = proximaEscolha({ status, bloco }, 'bloco', b.slug);
                    ir({ status: statusDaUrl(p.status.join(',')), bloco: [...p.bloco] });
                  }}
                >
                  {b.nome} <b className={estilos.chipNumero}>{b.pautas}</b>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {ativos}
    </div>
  );
}
