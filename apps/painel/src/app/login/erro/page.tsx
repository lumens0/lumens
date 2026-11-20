import Link from 'next/link';
import estilos from '../../page.module.css';

export default function Erro() {
  return (
    <main className={estilos.pagina}>
      <section className={estilos.cartao} aria-labelledby="titulo-erro">
        <p className={estilos.marca}>
          <img src="/lumens-marca.svg" alt="" width={44} height={44} className={estilos.logo} />
          <span>
            Lumens <span>Curadoria</span>
          </span>
        </p>
        <h1 id="titulo-erro">Não foi possível entrar</h1>
        <p className={estilos.descricao}>
          O link expirou, já foi usado ou o e-mail não está na lista da curadoria. Peça um link
          novo.
        </p>
        <Link className={estilos.botao} href="/login">
          Pedir um link novo
        </Link>
      </section>
    </main>
  );
}
