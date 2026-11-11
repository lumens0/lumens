'use client';

import { useEffect, useState } from 'react';
import { formatarNumero } from './BarraApoios';

/**
 * Número que sobe de zero até o valor quando a página abre. O HTML do servidor já traz o valor
 * final (quem está sem JavaScript, ou pediu menos movimento, vê o número parado).
 */
export function Numero({ valor }: { valor: number }) {
  const [atual, setAtual] = useState(valor);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || valor === 0) return;
    const inicio = performance.now();
    let quadro = requestAnimationFrame(function passo(agora) {
      const t = Math.min(1, (agora - inicio) / 900);
      setAtual(Math.round(valor * (1 - (1 - t) ** 3)));
      if (t < 1) quadro = requestAnimationFrame(passo);
    });
    return () => {
      cancelAnimationFrame(quadro);
    };
  }, [valor]);
  return <>{formatarNumero(atual)}</>;
}
