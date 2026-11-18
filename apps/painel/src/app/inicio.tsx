import Link from 'next/link';
import type { ResumoDaCuradoria } from '@lumens/dominio';
import estilos from './painel.module.css';

/** Início do painel para quem já entrou: resumo do trabalho que espera a curadoria. */
export function Inicio({ resumo }: { resumo: ResumoDaCuradoria }) {
  return (
    <>
      <h1>Painel de curadoria</h1>
      <ul className={estilos.lista}>
        <li className={[estilos.cartao, estilos.cartaoClicavel].join(' ')}>
          <h2>
            <Link href="/pautas?status=em_curadoria">Pautas a decidir</Link>
          </h2>
          <p className={estilos.detalhes}>
            {resumo.pautasADecidir} esperando decisão; {resumo.pautasAtrasadas}{' '}
            {resumo.pautasAtrasadas === 1 ? 'pauta atrasada' : 'pautas atrasadas'} no prazo de 24 h.
          </p>
        </li>
        <li className={[estilos.cartao, estilos.cartaoClicavel].join(' ')}>
          <h2>
            <Link href="/relatos">Relatos a moderar</Link>
          </h2>
          <p className={estilos.detalhes}>{resumo.relatosAModerar} relatos em pautas publicadas.</p>
        </li>
        <li className={[estilos.cartao, estilos.cartaoClicavel].join(' ')}>
          <h2>
            <Link href="/pautas?status=cobrando&pendencia=sem_resposta_oficial">
              Pautas em cobrança sem resposta oficial
            </Link>
          </h2>
          <p className={estilos.detalhes}>
            {resumo.pautasSemRespostaOficial}{' '}
            {resumo.pautasSemRespostaOficial === 1 ? 'pauta' : 'pautas'}.
          </p>
        </li>
        <li className={[estilos.cartao, estilos.cartaoClicavel].join(' ')}>
          <h2>
            <Link href="/pautas?status=todas&pendencia=conferencia_aberta">
              Conferências abertas
            </Link>
          </h2>
          <p className={estilos.detalhes}>
            {resumo.conferenciasAbertas}{' '}
            {resumo.conferenciasAbertas === 1 ? 'conferência' : 'conferências'}.
          </p>
        </li>
      </ul>
    </>
  );
}
