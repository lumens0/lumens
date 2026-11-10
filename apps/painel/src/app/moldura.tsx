import Link from 'next/link';
import type { ReactNode } from 'react';
import estilos from './painel.module.css';

/** Cabeçalho comum das telas de quem já entrou. Recebe `sair` para o teste não carregar o Auth.js. */
export function Moldura({
  nome,
  sair,
  children,
}: {
  nome: string;
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
          <Link href="/fila">Pautas novas</Link>
          <Link href="/pautas">Todas as pautas</Link>
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
