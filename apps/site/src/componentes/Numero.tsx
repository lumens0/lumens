'use client';

import { useEffect, useState } from 'react';
import { formatarNumero } from './BarraApoios';

/**
 * Leva o número exibido até `valor`: sobe de zero com animação ou, com "reduzir movimento"
 * (ou valor zero), troca direto. Devolve a limpeza do efeito.
 */
export function contarAte(
  valor: number,
  definir: (n: number) => void,
  reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches,
): () => void {
  if (reduzir || valor === 0) {
    definir(valor);
    return () => undefined;
  }
  const inicio = performance.now();
  let quadro = requestAnimationFrame(function passo(agora) {
    const t = Math.min(1, (agora - inicio) / 900);
    definir(Math.round(valor * (1 - (1 - t) ** 3)));
    if (t < 1) quadro = requestAnimationFrame(passo);
  });
  return () => {
    cancelAnimationFrame(quadro);
  };
}

/**
 * Número que sobe de zero até o valor quando a página abre. O HTML do servidor já traz o valor
 * final (quem está sem JavaScript, ou pediu menos movimento, vê o número parado).
 */
export function Numero({ valor }: { valor: number }) {
  const [atual, setAtual] = useState(valor);
  useEffect(() => contarAte(valor, setAtual), [valor]);
  return <>{formatarNumero(atual)}</>;
}
