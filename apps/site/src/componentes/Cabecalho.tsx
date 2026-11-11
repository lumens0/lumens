import Link from 'next/link';
import { Abas } from './Abas';
import { BotaoRelatar } from './BotaoWhatsApp';
import estilos from './cabecalho.module.css';

/** Faixa do topo em todas as páginas: marca, seções do site e o atalho para relatar no bot. */
export function Cabecalho() {
  return (
    <header className={estilos.cabecalho}>
      <div className={estilos.faixa}>
        <Link href="/" className={estilos.marca}>
          <span className={estilos.orbe} aria-hidden="true" />
          <span>
            Lumens<span className={estilos.ponto}>.</span>
          </span>
        </Link>
        <Abas />
        <div className={estilos.acao}>
          <BotaoRelatar />
        </div>
      </div>
    </header>
  );
}
