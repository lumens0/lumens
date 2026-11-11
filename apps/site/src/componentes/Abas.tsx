'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import estilos from './cabecalho.module.css';

const ABAS = [
  { href: '/', rotulo: 'Pautas' },
  { href: '/mapa', rotulo: 'Mapa' },
  { href: '/conquistas', rotulo: 'Conquistas' },
  { href: '/atividade', rotulo: 'Atividade' },
];

/** A página de uma pauta conta como "Pautas": é de lá que se chega nela. */
export function abaAtual(caminho: string, href: string): boolean {
  if (href === '/') return caminho === '/' || caminho.startsWith('/p/');
  return caminho === href || caminho.startsWith(`${href}/`);
}

export function Abas() {
  const caminho = usePathname();
  return (
    <nav aria-label="Seções do site" className={estilos.abas}>
      {ABAS.map(({ href, rotulo }) => (
        <Link
          key={href}
          href={href}
          className={estilos.aba}
          aria-current={abaAtual(caminho, href) ? 'page' : undefined}
        >
          {rotulo}
        </Link>
      ))}
    </nav>
  );
}
