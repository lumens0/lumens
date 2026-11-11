import Link from 'next/link';
import { Abas } from './Abas';
import { BotaoRelatar } from './BotaoWhatsApp';
import estilos from './cabecalho.module.css';

/** Topo de todas as páginas: a marca, as seções do site e o atalho para relatar no bot. */
export function Cabecalho() {
  return (
    <header className={estilos.cabecalho}>
      <div className={estilos.faixa}>
        <Link href="/" className={estilos.marca}>
          <span className={estilos.janela} aria-hidden="true" />
          Lumens
        </Link>
        <Abas />
        <div className={estilos.acao}>
          <BotaoRelatar />
        </div>
      </div>
    </header>
  );
}
