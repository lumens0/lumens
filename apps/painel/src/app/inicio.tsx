import Link from 'next/link';
import type { ResumoDaCuradoria } from '@lumens/dominio';
import estilos from './painel.module.css';

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** Um cartão do resumo: o nome da fila (link), o número e uma linha de contexto. */
function Indicador({
  href,
  titulo,
  numero,
  unidade,
  detalhe,
  alerta = false,
}: {
  href: string;
  titulo: string;
  numero: number;
  unidade: string;
  detalhe?: string;
  alerta?: boolean;
}) {
  return (
    <li
      className={[
        estilos.cartao,
        estilos.cartaoClicavel,
        estilos.indicador,
        alerta ? estilos.indicadorAlerta : '',
      ].join(' ')}
    >
      <h2>
        <Link href={href}>{titulo}</Link>
      </h2>
      <p className={estilos.numeros}>
        <strong>{numero}</strong> {unidade}
      </p>
      {detalhe && <p className={estilos.detalhes}>{detalhe}</p>}
    </li>
  );
}

/** Início do painel para quem já entrou: resumo do trabalho que espera a curadoria. */
export function Inicio({ resumo }: { resumo: ResumoDaCuradoria }) {
  const atrasadas = resumo.pautasAtrasadas;
  return (
    <>
      <h1>Painel de curadoria</h1>
      <ul className={estilos.resumo}>
        <Indicador
          href="/pautas?status=em_curadoria"
          titulo="Pautas a decidir"
          numero={resumo.pautasADecidir}
          unidade="esperando decisão"
          detalhe={
            atrasadas === 0
              ? 'Nenhuma atrasada no prazo de 24 h'
              : `${String(atrasadas)} ${plural(atrasadas, 'pauta atrasada', 'pautas atrasadas')} no prazo de 24 h`
          }
          alerta={atrasadas > 0}
        />
        <Indicador
          href="/relatos"
          titulo="Relatos a moderar"
          numero={resumo.relatosAModerar}
          unidade={plural(resumo.relatosAModerar, 'relato', 'relatos') + ' em pautas publicadas'}
        />
        <Indicador
          href="/pautas?status=cobrando&pendencia=sem_resposta_oficial"
          titulo="Pautas em cobrança sem resposta oficial"
          numero={resumo.pautasSemRespostaOficial}
          unidade={plural(resumo.pautasSemRespostaOficial, 'pauta', 'pautas')}
        />
        <Indicador
          href="/pautas?status=todas&pendencia=conferencia_aberta"
          titulo="Conferências abertas"
          numero={resumo.conferenciasAbertas}
          unidade={plural(resumo.conferenciasAbertas, 'conferência', 'conferências')}
        />
      </ul>
    </>
  );
}
