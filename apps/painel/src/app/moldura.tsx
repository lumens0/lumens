import Link from 'next/link';
import type { ReactNode } from 'react';
import estilos from './painel.module.css';
import { Enviar } from './enviar';
import { Navegacao } from './navegacao';

/**
 * Cabeçalho comum das telas de quem já entrou: logo, nome de quem está na sessão com o "Sair" e as
 * seções, que no celular rolam de lado numa linha só. Recebe `sair` para o teste não carregar o
 * Auth.js. O link de curadores só aparece para administrador; quem protege a tela é a página.
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
        <div className={estilos.faixa}>
          <Link className={estilos.marca} href="/">
            {/* `alt` vazio: o nome vem escrito ao lado. */}
            <img src="/lumens-marca.svg" alt="" width={44} height={44} className={estilos.logo} />
            <span>
              Lumens <span className={estilos.marcaArea}>Curadoria</span>
            </span>
          </Link>
          <form action={sair} className={estilos.sessao}>
            <span className={estilos.nome}>{nome}</span>
            <Enviar className={estilos.botaoNoite} title={`Sair da conta de ${nome}`}>
              Sair
            </Enviar>
          </form>
          <Navegacao administrador={administrador} />
        </div>
      </header>
      <main className={estilos.conteudo}>{children}</main>
    </div>
  );
}
