import Link from 'next/link';
import estilos from '../../paginas.module.css';

/** Pauta que não existe ou não está no site: a mesma mensagem, sem revelar qual dos dois. */
export default function PautaNaoEncontrada() {
  return (
    <main className={[estilos.pagina, estilos.nao].join(' ')}>
      <div role="status">
        <p className={estilos.numeroVazado} aria-hidden="true">
          404
        </p>
        <h1 className={estilos.titulo}>Essa página não está acesa.</h1>
        <p className={estilos.intro}>
          A pauta pode ter sido recusada ou o endereço pode estar errado.
        </p>
        <Link href="/pautas" className={estilos.botao}>
          Voltar para as pautas
        </Link>
      </div>
    </main>
  );
}
