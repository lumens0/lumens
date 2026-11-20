'use client';

import { useEffect, useState } from 'react';
import { formatarNumero } from './BarraApoios';
import estilos from './componentes.module.css';

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
    // O carimbo do quadro pode ser anterior ao `inicio` (é o começo do quadro): t nunca é negativo,
    // senão o número apareceria abaixo de zero no primeiro quadro.
    const t = Math.min(1, Math.max(0, (agora - inicio) / 900));
    definir(Math.round(valor * (1 - (1 - t) ** 3)));
    if (t < 1) quadro = requestAnimationFrame(passo);
  });
  return () => {
    cancelAnimationFrame(quadro);
  };
}

/**
 * Número que sobe de zero até o valor quando a página abre. O HTML do servidor já traz o valor
 * final (quem está sem JavaScript, ou pediu menos movimento, vê o número parado). O leitor de
 * tela lê só o valor final: os quadros intermediários ficam escondidos dele (SCRUM-306).
 */
export function Numero({ valor }: { valor: number }) {
  const [atual, setAtual] = useState(valor);
  useEffect(() => contarAte(valor, setAtual), [valor]);
  return (
    <>
      <span aria-hidden="true">{formatarNumero(atual)}</span>
      <span className={estilos.somenteLeitor}>{formatarNumero(valor)}</span>
    </>
  );
}
