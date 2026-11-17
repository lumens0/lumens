import { LIMITE_DA_LISTA, type PautaDaCuradoria } from '@lumens/dominio';
import Link from 'next/link';
import estilos from '../painel.module.css';
import { textoDoPrazo } from '../prazo';
import { STATUS } from './status';

/** Lista única de pautas da curadoria, filtrável por situação e título. */
export function ListaDePautas({
  pautas,
  status,
  q,
}: {
  pautas: PautaDaCuradoria[];
  status: string;
  q: string;
}) {
  return (
    <>
      <h1>Pautas</h1>
      <p className={estilos.apoio}>
        Abra uma pauta para conferir os relatos e acompanhar a resposta oficial.
      </p>
      {pautas.length >= LIMITE_DA_LISTA && (
        <p className={estilos.aviso} role="status">
          Mostrando as {LIMITE_DA_LISTA} mais antigas. Use o filtro ou a busca para achar as outras.
        </p>
      )}
      <form action="/pautas" method="get" className={estilos.filtros}>
        <label htmlFor="status-pautas">Situação</label>
        <select id="status-pautas" name="status" defaultValue={status}>
          <option value="todas">Todas as pautas</option>
          {Object.entries(STATUS).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
        <label htmlFor="busca-pautas">Buscar pelo título</label>
        <input id="busca-pautas" name="q" type="search" defaultValue={q} />
        <button className={estilos.botao} type="submit">
          Filtrar
        </button>
      </form>
      {pautas.length === 0 ? (
        <p className={estilos.aviso}>Nenhuma pauta encontrada.</p>
      ) : (
        <ul className={estilos.lista}>
          {pautas.map((pauta) => (
            <li key={pauta.id} className={[estilos.cartao, estilos.cartaoClicavel].join(' ')}>
              <h2>
                <Link href={`/pautas/${pauta.id}`}>{pauta.titulo}</Link>
              </h2>
              <p className={estilos.detalhes}>
                {pauta.bloco ?? 'Campus inteiro'} · {STATUS[pauta.status]} · {pauta.apoios} de{' '}
                {pauta.meta} apoios
              </p>
              {pauta.status === 'em_curadoria' && (
                <p
                  className={[estilos.detalhes, pauta.restanteMs < 0 ? estilos.atrasada : ''].join(
                    ' ',
                  )}
                >
                  Prazo: {textoDoPrazo(pauta.restanteMs)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
