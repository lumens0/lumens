import type { Metadata } from 'next';
import Link from 'next/link';
import estilos from '../componentes/componentes.module.css';
import pagina from '../componentes/pauta/pauta.module.css';

// O Next responde 404 sozinho e acrescenta `noindex`. O cabeçalho da marca vem do layout.
export const metadata: Metadata = { title: 'Página não encontrada · Lumens' };

/** Qualquer endereço que não existe (SCRUM-380): a pauta tem a sua, em `p/[slug]/not-found.tsx`. */
export default function PaginaNaoEncontrada() {
  return (
    <main className={pagina.pagina}>
      <div role="status" className={estilos.estado}>
        <h1 className={estilos.estadoTitulo} style={{ margin: '0 0 8px' }}>
          Não encontramos essa página
        </h1>
        <p>O endereço pode estar errado, ou a página mudou de lugar.</p>
        <div className={estilos.acoes}>
          <Link href="/pautas" className={estilos.botao}>
            Ver todas as pautas
          </Link>
        </div>
      </div>
    </main>
  );
}
