import Link from 'next/link';
import estilos from './painel.module.css';

/** Início do painel para quem já entrou: o que está esperando a curadoria. */
export function Inicio({
  nome,
  pautasNaFila,
  relatosPendentes,
}: {
  nome: string;
  pautasNaFila: number;
  relatosPendentes: number;
}) {
  return (
    <>
      <h1>Painel de curadoria</h1>
      <p className={estilos.apoio}>Você entrou como {nome}.</p>
      <ul className={estilos.lista}>
        <li className={estilos.cartao}>
          <h2>
            <Link href="/fila">Pautas novas</Link>
          </h2>
          <p className={estilos.detalhes}>
            {pautasNaFila === 0
              ? 'Nenhuma pauta esperando decisão.'
              : pautasNaFila === 1
                ? '1 pauta esperando decisão.'
                : `${String(pautasNaFila)} pautas esperando decisão.`}
          </p>
        </li>
        <li className={estilos.cartao}>
          <h2>
            <Link href="/relatos">Relatos novos</Link>
          </h2>
          <p className={estilos.detalhes}>
            {relatosPendentes === 0
              ? 'Nenhum relato esperando moderação.'
              : relatosPendentes === 1
                ? '1 relato esperando moderação.'
                : `${String(relatosPendentes)} relatos esperando moderação.`}
          </p>
        </li>
      </ul>
    </>
  );
}
