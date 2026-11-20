'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Icone } from '../Icone';
import estilos from './home.module.css';

/**
 * "Ver em lista" (SCRUM-374): as pautas do carrossel numa lista, num painel que entra pela direita no
 * computador e sobe de baixo no celular, o mesmo padrão do painel do mapa. É um `<dialog>` modal:
 * prende o foco, fecha no Esc e devolve o foco ao botão. A lista vem pronta do servidor.
 */
export function ListaDePautas({ resumo, children }: { resumo: string; children: ReactNode }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  // Enquanto a lista está aberta, a página atrás não rola: só a lista e os filtros dela.
  useEffect(() => {
    const el = dialogo.current;
    if (!el) return;
    const segurar = (e: Event) => {
      if (!el.open) return;
      const alvo = e.target as Element | null;
      if (!alvo?.closest('[data-rola]')) e.preventDefault();
    };
    addEventListener('wheel', segurar, { passive: false });
    addEventListener('touchmove', segurar, { passive: false });
    return () => {
      removeEventListener('wheel', segurar);
      removeEventListener('touchmove', segurar);
    };
  }, []);
  return (
    <>
      <button
        type="button"
        className={estilos.verLista}
        aria-haspopup="dialog"
        onClick={() => dialogo.current?.showModal()}
      >
        <Icone nome="lista" />
        Ver em lista
      </button>
      <dialog
        ref={dialogo}
        className={estilos.gaveta}
        aria-labelledby="lista-titulo"
        onClick={(e) => {
          // Clique no fundo escuro (fora do painel) fecha.
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className={estilos.gavetaCabeca}>
          <div>
            <h2 id="lista-titulo">Pautas em lista</h2>
            <p>{resumo}</p>
          </div>
          <button
            type="button"
            className={estilos.fechar}
            aria-label="Fechar a lista"
            onClick={() => dialogo.current?.close()}
          >
            <Icone nome="fechar" />
          </button>
        </div>
        <div className={estilos.gavetaCorpo} data-rola>
          {children}
        </div>
      </dialog>
    </>
  );
}
