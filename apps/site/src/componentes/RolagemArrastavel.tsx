'use client';

import { useRef, type ElementType, type HTMLAttributes, type PointerEvent } from 'react';

/** Quantos pixels o mouse anda antes de o gesto virar arrasto (abaixo disso, ainda é um clique). */
const LIMITE_DO_ARRASTO = 5;

/**
 * Faixa que rola para o lado. No toque a rolagem já é nativa; com o mouse, clicar e arrastar também
 * rola. Quem arrasta não clica no chip em que soltou o botão.
 */
export function RolagemArrastavel({
  como: Tag = 'div',
  ...props
}: { como?: ElementType } & HTMLAttributes<HTMLElement>) {
  const gesto = useRef({ x: 0, inicio: 0, ativo: false, arrastou: false });

  function aoPressionar(e: PointerEvent<HTMLElement>) {
    gesto.current.arrastou = false;
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    gesto.current = {
      x: e.clientX,
      inicio: e.currentTarget.scrollLeft,
      ativo: true,
      arrastou: false,
    };
  }

  function aoMover(e: PointerEvent<HTMLElement>) {
    const g = gesto.current;
    if (!g.ativo) return;
    const deslocamento = e.clientX - g.x;
    if (!g.arrastou) {
      if (Math.abs(deslocamento) < LIMITE_DO_ARRASTO) return;
      g.arrastou = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.dataset.arrastando = 'true';
    }
    e.currentTarget.scrollLeft = g.inicio - deslocamento;
  }

  function aoSoltar(e: PointerEvent<HTMLElement>) {
    gesto.current.ativo = false;
    delete e.currentTarget.dataset.arrastando;
  }

  return (
    <Tag
      {...props}
      onPointerDown={aoPressionar}
      onPointerMove={aoMover}
      onDragStart={(e: React.DragEvent) => {
        e.preventDefault();
      }}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      onClickCapture={(e: React.MouseEvent) => {
        if (!gesto.current.arrastou) return;
        gesto.current.arrastou = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    />
  );
}
