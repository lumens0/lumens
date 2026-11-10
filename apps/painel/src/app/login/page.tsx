import { entrar } from '../acoes';
import estilos from '../page.module.css';

export default function Login() {
  return (
    <main className={estilos.pagina}>
      <section className={estilos.cartao} aria-labelledby="titulo-login">
        <p className={estilos.marca}>Lumens</p>
        <h1 id="titulo-login">Entrar no painel</h1>
        <p className={estilos.descricao}>
          Digite seu e-mail de curadoria. Mandamos um link de acesso, sem senha.
        </p>
        <form action={entrar} className={estilos.formulario}>
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <button className={estilos.botao} type="submit">
            Receber o link
          </button>
        </form>
      </section>
    </main>
  );
}
