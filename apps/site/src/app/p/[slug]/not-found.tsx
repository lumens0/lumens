import Link from 'next/link';
import estilos from '../../../componentes/componentes.module.css';
import pagina from '../../../componentes/pauta/pauta.module.css';

/** Pauta que não existe ou não está no site: a mesma mensagem, sem revelar qual dos dois. */
export default function PautaNaoEncontrada() {
  return (
    <main className={pagina.pagina}>
      <div role="status" className={estilos.estado}>
        <p className={estilos.estadoTitulo}>Não encontramos essa pauta.</p>
        <p>O endereço pode estar errado, ou a pauta ainda não está pública.</p>
        <div className={estilos.acoes}>
          <Link href="/" className={estilos.botao}>
            Ver todas as pautas
          </Link>
        </div>
      </div>
    </main>
  );
}
