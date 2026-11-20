'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Icone, type NomeDoIcone } from './Icone';
import estilos from './hud.module.css';

export interface ItemDoHud {
  /** `id` da seção na página. */
  id: string;
  rotulo: string;
  /** Ícone da parte; sem ele, o HUD mostra `numero` (dias, anos, capítulos). */
  icone?: NomeDoIcone;
  numero?: string;
}

/**
 * Evento disparado antes de rolar até uma parte. A página que tem um ponto melhor que o topo da
 * seção (a cena da home já montada, por exemplo) cancela o evento e rola ela mesma.
 */
export const EVENTO_IR = 'lumens:ir';

/**
 * HUD das partes da página (SCRUM-374): no computador, uma coluna de ícones fixa na esquerda que abre
 * com os nomes ao passar o mouse ou chegar pelo teclado; no celular, uma barra no rodapé. A parte em
 * que a pessoa está fica acesa e a barra fina mostra quanto da página já passou. Os itens são links
 * comuns para as seções: sem JavaScript, continuam levando até elas.
 */
export function Hud({
  itens,
  rotulo,
  sempreAberto = false,
}: {
  itens: readonly ItemDoHud[];
  rotulo: string;
  sempreAberto?: boolean;
}) {
  const [atual, setAtual] = useState(itens[0]?.id);
  const percurso = useRef<HTMLElement>(null);
  useEffect(() => {
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      const linha = innerHeight * 0.45;
      let id = itens[0]?.id;
      for (const item of itens) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= linha) id = item.id;
      }
      setAtual(id);
      const max = document.documentElement.scrollHeight - innerHeight;
      percurso.current?.style.setProperty(
        '--pc',
        `${String(max > 0 ? (scrollY / max) * 100 : 0)}%`,
      );
    };
    const agendar = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    agendar();
    addEventListener('scroll', agendar, { passive: true });
    addEventListener('resize', agendar);
    return () => {
      cancelAnimationFrame(quadro);
      removeEventListener('scroll', agendar);
      removeEventListener('resize', agendar);
    };
  }, [itens]);

  const ir = (e: MouseEvent, id: string) => {
    e.preventDefault();
    const cancelado = !dispatchEvent(new CustomEvent(EVENTO_IR, { detail: id, cancelable: true }));
    if (cancelado) return;
    const el = document.getElementById(id);
    if (!el) return;
    const topo = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
    const margem = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    const folga = Math.max(topo + 12, margem);
    const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollTo({
      top: el.getBoundingClientRect().top + scrollY - folga,
      behavior: reduzir ? 'auto' : 'smooth',
    });
  };

  return (
    <nav className={estilos.hud} data-aberto={sempreAberto || undefined} aria-label={rotulo}>
      <i className={estilos.percurso} aria-hidden="true">
        <b ref={percurso} />
      </i>
      <ol>
        {itens.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={atual === item.id ? 'location' : undefined}
              onClick={(e) => {
                ir(e, item.id);
              }}
            >
              {item.icone ? (
                <Icone nome={item.icone} />
              ) : (
                <span className={estilos.numero} aria-hidden="true">
                  {item.numero}
                </span>
              )}
              <span className={estilos.nome}>{item.rotulo}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
