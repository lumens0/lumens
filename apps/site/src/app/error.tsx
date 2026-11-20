'use client';

import estilos from './paginas.module.css';

/** Falha ao carregar a página: o `retry` do Next busca e renderiza de novo. */
export default function Erro({ retry }: { retry: () => void }) {
  return (
    <main className={[estilos.pagina, estilos.nao].join(' ')}>
      <div role="alert">
        <h1 className={estilos.titulo}>Não deu para carregar as pautas.</h1>
        <p className={estilos.intro}>
          Pode ser a conexão ou o servidor. Tente de novo em instantes.
        </p>
        <button type="button" className={estilos.botao} onClick={retry}>
          Tentar de novo
        </button>
      </div>
    </main>
  );
}
