import type { PautaDaCuradoria } from '@lumens/dominio';
import Link from 'next/link';
import estilos from '../painel.module.css';
import { textoDoPrazo } from '../prazo';

const FEITO: Record<string, string> = {
  aprovada: 'Pauta aprovada. Ela já aparece no site e pode receber apoios.',
  recusada: 'Pauta recusada. Quem criou recebe o motivo pelo WhatsApp.',
};

/** Fila das pautas que esperam decisão (5.2, SCRUM-167), da mais antiga para a mais nova. */
export function Fila({
  pautas,
  feito,
}: {
  pautas: PautaDaCuradoria[];
  feito?: string | undefined;
}) {
  const aviso = feito === undefined ? undefined : FEITO[feito];
  return (
    <>
      <h1>Pautas novas</h1>
      <p className={estilos.apoio}>
        Cada pauta tem 24 horas para ser aprovada ou recusada. As mais antigas vêm primeiro.
      </p>
      {aviso !== undefined && (
        <p className={estilos.aviso} role="status">
          {aviso}
        </p>
      )}
      {pautas.length === 0 ? (
        <p className={estilos.aviso}>Nenhuma pauta esperando decisão.</p>
      ) : (
        <ul className={estilos.lista}>
          {pautas.map((pauta) => (
            <li key={pauta.id} className={estilos.cartao}>
              <h2>
                <Link href={`/pautas/${pauta.id}`}>{pauta.titulo}</Link>
              </h2>
              <p className={estilos.detalhes}>
                {pauta.bloco ?? 'Campus inteiro'} ·{' '}
                <span className={pauta.restanteMs < 0 ? estilos.atrasada : undefined}>
                  {textoDoPrazo(pauta.restanteMs)}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
