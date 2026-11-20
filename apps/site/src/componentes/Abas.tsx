'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { Icone } from './Icone';
import estilos from './cabecalho.module.css';

const ABAS = [
  { href: '/', rotulo: 'Início' },
  { href: '/pautas', rotulo: 'Pautas' },
  { href: '/mapa', rotulo: 'Mapa' },
  { href: '/conquistas', rotulo: 'Conquistas' },
  { href: '/atividade', rotulo: 'Atividade' },
  { href: '/manual', rotulo: 'Manual' },
];

/** A página de uma pauta (`/p/...`) conta como "Pautas": é de lá que se chega nela. */
export function abaAtual(caminho: string, href: string): boolean {
  if (href === '/') return caminho === '/';
  if (href === '/pautas') return caminho === '/pautas' || caminho.startsWith('/p/');
  return caminho === href || caminho.startsWith(`${href}/`);
}

/**
 * As seções do site. No computador ficam lado a lado; no celular, atrás de um botão de menu que abre
 * a lista por cima da página (SCRUM-374). Sem JavaScript não há botão e a lista fica à vista.
 */
const nada = () => () => undefined;
export function Abas() {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  // No servidor e sem JavaScript o menu não existe; depois de hidratar, ele assume.
  const hidratado = useSyncExternalStore(
    nada,
    () => true,
    () => false,
  );
  return (
    <>
      {hidratado && (
        <button
          type="button"
          className={estilos.menu}
          aria-label="Menu"
          aria-expanded={aberto}
          aria-controls="secoes-do-site"
          onClick={() => {
            setAberto((antes) => !antes);
          }}
        >
          <Icone nome={aberto ? 'fechar' : 'lista'} />
        </button>
      )}
      <nav
        id="secoes-do-site"
        aria-label="Seções do site"
        className={estilos.abas}
        data-aberto={hidratado ? aberto : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setAberto(false);
        }}
      >
        {ABAS.map(({ href, rotulo }) => (
          <Link
            key={href}
            href={href}
            className={estilos.aba}
            aria-current={abaAtual(caminho, href) ? 'page' : undefined}
            onClick={() => {
              setAberto(false);
            }}
          >
            {rotulo}
          </Link>
        ))}
      </nav>
    </>
  );
}
