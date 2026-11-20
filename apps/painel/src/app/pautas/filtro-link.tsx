'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import { buscaVigente } from './busca-enviada';
import { urlDaLista, type ParametrosDaListaDoPainel } from './url-da-lista';

/**
 * Chip de etapa ou de pendência: um link normal (funciona sem JavaScript, com a busca que a página
 * mostra). Com JavaScript, o clique usa a busca enviada por último: quem digitou `sala` e tocou numa
 * etapa antes de a resposta chegar não perde a busca.
 */
export function FiltroLink({
  filtros,
  className,
  style,
  atual,
  children,
}: {
  filtros: ParametrosDaListaDoPainel;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  atual?: boolean;
  children: ReactNode;
}) {
  const roteador = useRouter();
  return (
    <Link
      href={urlDaLista(filtros)}
      className={className}
      style={style}
      aria-current={atual ? 'true' : undefined}
      onClick={(e) => {
        const vigente = buscaVigente(filtros.q);
        const outraAba = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
        if (vigente === filtros.q || outraAba) return;
        e.preventDefault();
        roteador.push(urlDaLista({ ...filtros, q: vigente }));
      }}
    >
      {children}
    </Link>
  );
}
