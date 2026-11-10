import Link from 'next/link';
import estilos from '../../page.module.css';

export default function Erro() {
  return (
    <main className={estilos.pagina}>
      <section className={estilos.cartao} aria-labelledby="titulo-erro">
        <p className={estilos.marca}>Lumens</p>
        <h1 id="titulo-erro">Este link não vale mais</h1>
        <p className={estilos.descricao}>
          O link de acesso vale uma vez só e por 15 minutos. Peça um novo para entrar.
        </p>
        <Link className={estilos.botao} href="/login">
          Pedir um novo link
        </Link>
      </section>
    </main>
  );
}
