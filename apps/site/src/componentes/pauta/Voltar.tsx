'use client';

import Link from 'next/link';
import estilos from './pauta.module.css';

/**
 * Volta para onde a pessoa estava (a lista, o mapa). Quem abriu a pauta numa aba nova, ou está
 * sem JavaScript, vai para a lista de pautas: o `href` é o caminho de quem não tem de onde voltar.
 */
export function Voltar() {
  return (
    <Link
      href="/"
      className={estilos.voltar}
      onClick={(e) => {
        // A navegação dentro do site não muda o `document.referrer`; o histórico é o que diz se
        // há de onde voltar. Aba aberta direto pelo link (do WhatsApp, por exemplo) não tem.
        if (history.length > 1) {
          e.preventDefault();
          history.back();
        }
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Voltar
    </Link>
  );
}
