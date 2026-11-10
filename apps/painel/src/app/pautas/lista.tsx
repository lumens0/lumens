import type { PautaDaCuradoria } from '@lumens/dominio';
import Link from 'next/link';
import estilos from '../painel.module.css';
import { STATUS } from './[id]/pauta';

/** Todas as pautas com a situação de cada uma; é por aqui que se chega às que estão em cobrança. */
export function ListaDePautas({ pautas }: { pautas: PautaDaCuradoria[] }) {
  return (
    <>
      <h1>Todas as pautas</h1>
      <p className={estilos.apoio}>
        Abra uma pauta em cobrança para registrar a resposta oficial e a promessa.
      </p>
      {pautas.length === 0 ? (
        <p className={estilos.aviso}>Ainda não há pautas.</p>
      ) : (
        <ul className={estilos.lista}>
          {pautas.map((pauta) => (
            <li key={pauta.id} className={estilos.cartao}>
              <h2>
                <Link href={`/pautas/${pauta.id}`}>{pauta.titulo}</Link>
              </h2>
              <p className={estilos.detalhes}>
                {pauta.bloco ?? 'Campus inteiro'} · {STATUS[pauta.status]}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
