import Link from 'next/link';
import type { ReactNode } from 'react';
import estilos from './painel.module.css';

/**
 * Cabeçalho comum das telas de quem já entrou. Recebe `sair` para o teste não carregar o Auth.js.
 * O link de curadores só aparece para administrador; quem protege a tela é a própria página.
 * No celular os links recolhem num `<details>` para o cabeçalho caber numa linha (SCRUM-285).
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
  const links = (
    <>
      <Link href="/">Início</Link>
      <Link href="/pautas">Pautas</Link>
      <Link href="/relatos">Relatos em pautas publicadas</Link>
      {administrador && <Link href="/curadores">Curadores</Link>}
    </>
  );
  return (
    <div className={estilos.moldura}>
      <header className={estilos.cabecalho}>
        <div className={estilos.faixa}>
          <Link className={estilos.marca} href="/">
            {/* `alt` vazio: o nome vem escrito ao lado. */}
            <img src="/lumens-marca.svg" alt="" width={44} height={44} className={estilos.logo} />
            Lumens <span className={estilos.marcaArea}>Curadoria</span>
          </Link>
          <nav aria-label="Seções do painel" className={estilos.navegacao}>
            {links}
          </nav>
          <details className={estilos.menu}>
            <summary>Menu</summary>
            <nav aria-label="Seções do painel" className={estilos.menuLinks}>
              {links}
              <span className={estilos.menuNome}>{nome}</span>
            </nav>
          </details>
          <form action={sair} className={estilos.sessao}>
            <span className={estilos.nome}>{nome}</span>
            <button className={estilos.botaoNoite} type="submit" title={`Sair da conta de ${nome}`}>
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className={estilos.conteudo}>{children}</main>
    </div>
  );
}
