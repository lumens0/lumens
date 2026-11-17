import Link from 'next/link';
import type { ReactNode } from 'react';
import estilos from './painel.module.css';

/**
 * Cabeçalho comum das telas de quem já entrou. Recebe `sair` para o teste não carregar o Auth.js.
 * O link de curadores só aparece para administrador; quem protege a tela é a própria página.
 */
export function Moldura({
  nome,
  administrador = false,
  sair,
  children,
}: {
  nome: string;
  administrador?: boolean;
  sair: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <div className={estilos.moldura}>
      <header className={estilos.cabecalho}>
        <Link className={estilos.marca} href="/">
          Lumens · Curadoria
        </Link>
        <nav aria-label="Seções do painel" className={estilos.navegacao}>
          <Link href="/">Início</Link>
          <Link href="/pautas">Pautas</Link>
          <Link href="/relatos">Relatos em pautas publicadas</Link>
          {administrador && <Link href="/curadores">Curadores</Link>}
        </nav>
        <form action={sair} className={estilos.sessao}>
          <span>{nome}</span>
          <button className={estilos.botaoSecundario} type="submit">
            Sair
          </button>
        </form>
      </header>
      <main className={estilos.conteudo}>{children}</main>
    </div>
  );
}
