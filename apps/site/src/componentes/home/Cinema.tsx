'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { ligarCinema } from './cinema';
import estilos from './home.module.css';

/**
 * A moldura das cenas da home (SCRUM-374): o campus fixo atrás da página, o véu que escurece o mapa
 * onde há texto, os pinos da abertura e as cenas, que vêm prontas do servidor. O movimento é do
 * `ligarCinema`; sem JavaScript, ou com "menos movimento", a página fica parada e legível.
 */
export function Cinema({
  mapa,
  pinos,
  foco,
  children,
}: {
  mapa: ReactNode;
  pinos: ReactNode;
  /** Prédio do bloco escolhido no filtro: a abertura começa nele. */
  foco: number | undefined;
  children: ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => (raiz.current ? ligarCinema(raiz.current) : undefined), []);
  return (
    <div ref={raiz} className={estilos.cinema} data-foco={foco}>
      <div className={estilos.cenario} data-cenario aria-hidden="true">
        <div className={estilos.plano} data-plano>
          {mapa}
        </div>
      </div>
      <div className={estilos.veu} data-veu aria-hidden="true" />
      <div className={estilos.pinos} data-pinos aria-hidden="true">
        {pinos}
      </div>
      {children}
    </div>
  );
}
