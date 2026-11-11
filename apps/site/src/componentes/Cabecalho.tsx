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
          {/* `alt` vazio: o nome vem escrito ao lado. Arquivo estático, sem o otimizador de imagem. */}
          <img src="/lumens-marca.svg" alt="" width={44} height={44} className={estilos.logo} />
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
