import { entrar } from '../acoes';
import estilos from '../page.module.css';
import { Enviar } from '../enviar';

export default function Login() {
  return (
    <main className={estilos.pagina}>
      <section className={estilos.cartao} aria-labelledby="titulo-login">
        <p className={estilos.marca}>
          <img src="/lumens-marca.svg" alt="" width={44} height={44} className={estilos.logo} />
          <span>
            Lumens <span>Curadoria</span>
          </span>
        </p>
        <h1 id="titulo-login">Entrar no painel</h1>
        <p className={estilos.descricao}>
          Digite seu e-mail de curadoria. Mandamos um link de acesso, sem senha.
        </p>
        <form action={entrar} className={estilos.formulario}>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="nome@ufal.br"
          />
          <Enviar className={estilos.botao}>Receber o link</Enviar>
        </form>
      </section>
    </main>
  );
}
