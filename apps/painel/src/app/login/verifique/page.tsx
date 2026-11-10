import estilos from '../../page.module.css';

// A mesma tela para qualquer e-mail digitado: não revela quem é da curadoria.
export default function Verifique() {
  return (
    <main className={estilos.pagina}>
      <section className={estilos.cartao} aria-labelledby="titulo-verifique">
        <p className={estilos.marca}>Lumens</p>
        <h1 id="titulo-verifique">Confira seu e-mail</h1>
        <p className={estilos.estado} role="status">
          Se o e-mail estiver autorizado, você vai receber um link para entrar. Ele vale por 15
          minutos e uma vez só.
        </p>
      </section>
    </main>
  );
}
