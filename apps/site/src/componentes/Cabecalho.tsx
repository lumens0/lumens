import Link from 'next/link';
import { Abas } from './Abas';
import { BotaoRelatar } from './BotaoWhatsApp';
import estilos from './cabecalho.module.css';

/**
 * Topo de todas as páginas: a marca, o atalho para relatar no bot e as seções do site. A ordem no
 * HTML é a do protótipo (o botão logo depois da marca; no celular as abas descem para a 2ª linha).
 */
export function Cabecalho() {
  return (
    <header className={estilos.cabecalho}>
      <div className={estilos.faixa}>
        <Link href="/" className={estilos.marca}>
          <i className={estilos.logo} aria-hidden="true" />
          Lumens
        </Link>
        <div className={estilos.acao}>
          <BotaoRelatar />
        </div>
        <Abas />
      </div>
    </header>
  );
}
