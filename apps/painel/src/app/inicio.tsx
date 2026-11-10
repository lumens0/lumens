import estilos from './page.module.css';

/** Início do painel para quem já entrou. Separado da página para o teste não carregar o Auth.js. */
export function Inicio({ nome, sair }: { nome: string; sair: () => Promise<void> }) {
  return (
    <main className={estilos.pagina}>
      <section className={estilos.cartao} aria-labelledby="titulo-painel">
        <p className={estilos.marca}>Lumens</p>
        <h1 id="titulo-painel">Painel de curadoria</h1>
        <p className={estilos.descricao}>Você entrou como {nome}.</p>
        <form action={sair}>
          <button className={estilos.botao} type="submit">
            Sair
          </button>
        </form>
      </section>
    </main>
  );
}
