'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { ligarFundo } from './fundo';
import estilos from './internas.module.css';

/**
 * Moldura das páginas internas (SCRUM-374): o campus fixo atrás da página, o véu que escurece o
 * lado do texto e, no celular, a janela fixa no alto (`comJanela`) para ver o prédio de cada item
 * sem sair da leitura. Sem JavaScript, o campus fica parado atrás e a página continua normal.
 */
export function FundoInterno({
  mapa,
  modo = 'leitura',
  comJanela = false,
  comRotulo = false,
  className,
  children,
}: {
  mapa: ReactNode;
  modo?: 'leitura' | 'passeio';
  comJanela?: boolean;
  comRotulo?: boolean;
  className?: string | undefined;
  children: ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => (raiz.current ? ligarFundo(raiz.current) : undefined), []);

  return (
    <div
      ref={raiz}
      className={[
        estilos.raiz,
        comJanela ? estilos.comJanela : '',
        modo === 'passeio' ? estilos.passeio : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-fundo={modo}
    >
      <div className={estilos.cenario} data-cenario aria-hidden="true">
        <div className={estilos.plano} data-plano>
          {mapa}
        </div>
      </div>
      <div className={estilos.veu} aria-hidden="true" />
      {comJanela && <div className={estilos.bordaJanela} aria-hidden="true" />}
      {comRotulo && <div className={estilos.rotuloMapa} data-rotulo aria-hidden="true" />}
      {children}
    </div>
  );
}
