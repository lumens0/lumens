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
      ← Voltar
    </Link>
  );
}
