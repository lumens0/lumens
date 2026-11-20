'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { StatusPublico } from '@lumens/contratos';
import { alternar, urlDeFiltros } from '../../dados/filtros';
import { aplicarBlocos, escolhaVigente } from '../../dados/pendentes';
import {
  buscarNaFolha,
  resumoDaFolha,
  textoDoBotaoDaFolha,
  type BlocoDaFolha,
} from '../../dados/folha';
import { montarSkyline } from '../../dados/skyline';
import type { Bloco, Pauta } from '../../dados/tipos';
import { STATUS } from '../StatusPill';
import estilos from './inicio.module.css';

/** Só o que o prédio em miniatura precisa de cada pauta: a lista toda iria pesada ao navegador. */
export type PautaDaFolha = Pick<
  Pauta,
  'slug' | 'titulo' | 'status' | 'apoios' | 'urgente' | 'bloco_slug'
>;

/**
 * Folha "Escolher blocos": o botão e o diálogo. No celular sobe de baixo; a partir de 700 px vira um
 * diálogo no centro. Dentro dela, o prédio em miniatura mostra ao vivo os blocos escolhidos; a
 * escolha só vale para a página quando se toca no botão final, que exige pelo menos um bloco.
 * ✕, Esc e o clique fora cancelam sem mudar o filtro que já estava ativo.
 *
 * Usa o `<dialog>` nativo: o foco fica preso dentro dele, o Esc fecha e o foco volta ao botão que o
 * abriu.
 */
export function FolhaDeBlocos({
  base,
  blocos,
  catalogo,
  siglas,
  pautas,
  atual,
  montarUrl,
}: {
  /** Página que recebe o filtro: `/` (Início) ou `/pautas`. */
  base: string;
  /** Endereço depois de aplicar, quando a página guarda mais que etapas e blocos (busca, ordem). */
  montarUrl?: (blocos: string[], status: readonly string[]) => string;
  blocos: BlocoDaFolha[];
  catalogo: Bloco[];
  siglas: Record<string, string>;
  pautas: PautaDaFolha[];
  atual: { status: StatusPublico[]; bloco: string[] };
}) {
  const router = useRouter();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [escolha, setEscolha] = useState<string[]>(atual.bloco);
  const [busca, setBusca] = useState('');

  const escolhidos = blocos.filter((b) => escolha.includes(b.slug));
  const visiveis = buscarNaFolha(blocos, busca);
  const predios = montarSkyline({
    blocos: catalogo,
    pautas: pautas as Pauta[],
    escolhidos: escolha,
    status: atual.status,
    siglas,
  });

  // Ao fechar (✕, Esc, clique fora ou depois de aplicar), a página volta a rolar. O ouvinte é o do
  // evento nativo `close`: é o único que cobre o Esc, que o navegador trata sozinho.
  useEffect(() => {
    const el = dialogo.current;
    const soltar = () => {
      document.body.style.overflow = '';
    };
    el?.addEventListener('close', soltar);
    return () => {
      el?.removeEventListener('close', soltar);
      soltar();
    };
  }, []);

  const fechar = () => {
    dialogo.current?.close();
    document.body.style.overflow = '';
  };

  const abrir = () => {
    // O rascunho parte da escolha vigente (a pendente, se ainda vale), e não do que a página mostra:
    // quem acabou de escolher um bloco e abre a folha antes de a página refletir não o vê desmarcado.
    setEscolha([...escolhaVigente(atual).bloco]);
    setBusca('');
    // O diálogo modal prende o foco, mas não trava a rolagem da página atrás dele.
    document.body.style.overflow = 'hidden';
    dialogo.current?.showModal();
  };
  const aplicar = () => {
    if (escolha.length === 0) return;
    // A escolha entra na pendente compartilhada, partindo das etapas pendentes (e não das que a página
    // ainda mostra): um clique numa etapa antes ou depois de aplicar não descarta os blocos nem a etapa.
    const vigente = aplicarBlocos(atual, escolha);
    router.replace(montarUrl?.(escolha, vigente.status) ?? urlDeFiltros(base, vigente), {
      scroll: false,
    });
    fechar();
  };

  return (
    <>
      <button type="button" className={estilos.botaoTexto} onClick={abrir}>
        Escolher entre os {catalogo.length} blocos
      </button>
      <dialog
        ref={dialogo}
        className={estilos.folha}
        aria-labelledby="folha-titulo"
        onClick={(e) => {
          // O clique no fundo escuro cai no próprio <dialog>; dentro dele, nos filhos.
          if (e.target === dialogo.current) fechar();
        }}
      >
        <div className={estilos.folhaConteudo}>
          <header className={estilos.folhaTopo}>
            <h2 id="folha-titulo">Escolher blocos</h2>
            <button
              type="button"
              className={estilos.folhaFechar}
              aria-label="Fechar sem filtrar"
              onClick={fechar}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </header>

          <div className={[estilos.folhaMini, 'noite'].join(' ')} aria-hidden="true">
            {predios.map((predio) => (
              <div
                key={predio.slug}
                className={[
                  estilos.miniPredio,
                  predio.escolhido ? estilos.escolhido : '',
                  escolha.length > 0 && !predio.escolhido ? estilos.esmaecido : '',
                ].join(' ')}
              >
                <div
                  className={estilos.miniJanelas}
                  style={{ '--colunas': predio.colunas } as CSSProperties}
                >
                  {predio.janelas.map((janela) => (
                    <i
                      key={janela.slug}
                      style={{ background: STATUS[janela.status].ponto }}
                      className={janela.fora ? estilos.fora : ''}
                    />
                  ))}
                </div>
                <small>{predio.sigla}</small>
              </div>
            ))}
          </div>

          <p
            role="status"
            className={[estilos.folhaResumo, escolha.length === 0 ? estilos.atraso : ''].join(' ')}
          >
            {resumoDaFolha(escolhidos)}
          </p>

          <label className={estilos.folhaBusca}>
            <span className={estilos.somenteLeitorDoInicio}>Buscar bloco por nome ou sigla</span>
            <input
              type="search"
              value={busca}
              placeholder="Buscar bloco por nome ou sigla"
              autoComplete="off"
              autoFocus
              onChange={(e) => {
                setBusca(e.target.value);
              }}
            />
          </label>

          <ul className={estilos.folhaChips}>
            {visiveis.map((bloco) => (
              <li key={bloco.slug}>
                <button
                  type="button"
                  className={estilos.chip}
                  aria-pressed={escolha.includes(bloco.slug)}
                  onClick={() => {
                    setEscolha((anterior) => alternar(anterior, bloco.slug));
                  }}
                >
                  {bloco.nome}
                  <span className={estilos.chipNumero}>{bloco.pautas}</span>
                </button>
              </li>
            ))}
          </ul>
          {visiveis.length === 0 && (
            <p className={estilos.dica}>Nenhum bloco com esse nome ou sigla.</p>
          )}

          <footer className={estilos.folhaRodape}>
            <button
              type="button"
              className={estilos.folhaAplicar}
              disabled={escolha.length === 0}
              onClick={aplicar}
            >
              {textoDoBotaoDaFolha(escolha.length)}
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
