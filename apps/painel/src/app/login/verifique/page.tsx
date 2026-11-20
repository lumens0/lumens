import Link from 'next/link';
import estilos from '../../page.module.css';

// A mesma tela para qualquer e-mail digitado: não revela quem é da curadoria.
export default function Verifique() {
  return (
    <main className={estilos.pagina}>
      <section className={estilos.cartao} aria-labelledby="titulo-verifique">
        <p className={estilos.marca}>
          <img src="/lumens-marca.svg" alt="" width={44} height={44} className={estilos.logo} />
          <span>
            Lumens <span>Curadoria</span>
          </span>
        </p>
        <h1 id="titulo-verifique">Verifique seu e-mail</h1>
        <p className={estilos.descricao} role="status">
          Se o e-mail estiver autorizado, mandamos um link de acesso para ele. Ele vale por 15
          minutos e só pode ser usado uma vez.
        </p>
        <p className={estilos.pequeno}>
          <Link href="/login">Usar outro e-mail</Link>
        </p>
      </section>
    </main>
  );
}
