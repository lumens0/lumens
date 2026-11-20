import type { Metadata } from 'next';
import Link from 'next/link';
import estilos from './paginas.module.css';

// O Next responde 404 sozinho e acrescenta `noindex`. O cabeçalho da marca vem do layout.
export const metadata: Metadata = { title: 'Página não encontrada · Lumens' };

/** Qualquer endereço que não existe (SCRUM-380): a pauta tem a sua, em `p/[slug]/not-found.tsx`. */
export default function PaginaNaoEncontrada() {
  return (
    <main className={[estilos.pagina, estilos.nao].join(' ')}>
      <div role="status">
        <p className={estilos.numeroVazado} aria-hidden="true">
          404
        </p>
        <h1 className={estilos.titulo}>Essa página não está acesa.</h1>
        <p className={estilos.intro}>O endereço pode estar errado, ou a página mudou de lugar.</p>
        <Link href="/pautas" className={estilos.botao}>
          Voltar para as pautas
        </Link>
      </div>
    </main>
  );
}
