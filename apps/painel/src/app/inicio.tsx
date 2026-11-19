import Link from 'next/link';
import type { ResumoDaCuradoria, VisaoGeralDaCuradoria } from '@lumens/dominio';
import estilos from './painel.module.css';
import { STATUS } from './pautas/status';

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/**
 * Um indicador do resumo, na mesma pilha alinhada à esquerda: o nome da fila (link, com altura de
 * duas linhas, para o número começar na mesma altura nos quatro), o número grande, a unidade e o
 * detalhe. Separados por filetes, sem cartões.
 */
function Indicador({
  href,
  titulo,
  numero,
  unidade,
  detalhe,
  extra,
  alerta = false,
}: {
  href: string;
  titulo: string;
  numero: number;
  unidade: string;
  detalhe?: string;
  extra?: string | undefined;
  alerta?: boolean;
}) {
  return (
    <li className={[estilos.indicador, alerta ? estilos.indicadorAlerta : ''].join(' ')}>
      <h2>
        <Link href={href}>{titulo}</Link>
      </h2>
      <p className={estilos.numeros}>
        <strong>{numero}</strong> {unidade}
      </p>
      {detalhe && <p className={estilos.detalhes}>{detalhe}</p>}
      {extra && <p className={estilos.detalhes}>{extra}</p>}
    </li>
  );
}

const HORA_MS = 3_600_000;

/** Tempo médio até a decisão em horas e minutos, ou dias quando passa de 48 h. */
export function textoDoTempoMedio(ms: number): string {
  const horas = ms / HORA_MS;
  if (horas >= 48) return `${String(Math.round(horas / 24))} dias`;
  if (horas >= 1) return `${horas.toFixed(1).replace('.', ',')} h`;
  return `${String(Math.max(1, Math.round(ms / 60_000)))} min`;
}

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** `2030-01-07` → `07 jan` (a semana começa na segunda, em UTC). */
export function rotuloDaSemana(semana: string): string {
  const [, mes, dia] = semana.split('-');
  return `${dia ?? ''} ${MES[Number(mes) - 1] ?? ''}`;
}

/** Quadro de linhas "rótulo, barra e número": o número está sempre escrito, a barra só ajuda. */
function Barras({ itens }: { itens: { chave: string; rotulo: React.ReactNode; valor: number }[] }) {
  const maior = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className={estilos.barras}>
      {itens.map((i) => (
        <li key={i.chave}>
          <span className={estilos.barrasRotulo}>{i.rotulo}</span>
          <progress value={i.valor} max={maior} aria-hidden="true" />
          <strong className={estilos.barrasNumero}>{i.valor}</strong>
        </li>
      ))}
    </ul>
  );
}

/** Início do painel para quem já entrou: resumo do trabalho que espera a curadoria. */
export function Inicio({
  resumo,
  visao,
}: {
  resumo: ResumoDaCuradoria;
  visao: VisaoGeralDaCuradoria;
}) {
  const atrasadas = resumo.pautasAtrasadas;
  const perto = visao.pautasPertoDeVencer;
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
          extra={
            perto === 0
              ? undefined
              : `${String(perto)} ${plural(perto, 'vence', 'vencem')} nas próximas 6 h`
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

      <section className={estilos.cartao} aria-labelledby="visao-status">
        <h2 id="visao-status">Pautas por status</h2>
        <Barras
          itens={visao.pautasPorStatus.map((s) => ({
            chave: s.status,
            valor: s.total,
            rotulo: <Link href={`/pautas?status=${s.status}`}>{STATUS[s.status]}</Link>,
          }))}
        />
      </section>

      <section className={estilos.cartao} aria-labelledby="visao-apoios">
        <h2 id="visao-apoios">Apoios por semana</h2>
        <Barras
          itens={visao.apoiosPorSemana.map((s) => ({
            chave: s.semana,
            valor: s.apoios,
            rotulo: `Semana de ${rotuloDaSemana(s.semana)}`,
          }))}
        />
        <p className={estilos.detalhes}>Últimas 8 semanas, de segunda a domingo (UTC).</p>
      </section>

      <section className={estilos.cartao} aria-labelledby="visao-tempo">
        <h2 id="visao-tempo">Tempo até a decisão</h2>
        {visao.tempoMedioAteDecisaoMs === null ? (
          <p className={estilos.detalhes}>Nenhuma decisão nos últimos 30 dias.</p>
        ) : (
          <>
            <p className={estilos.numeros}>
              <strong>{textoDoTempoMedio(visao.tempoMedioAteDecisaoMs)}</strong> em média
            </p>
            <p className={estilos.detalhes}>
              {String(visao.decisoesNoPeriodo)}{' '}
              {plural(visao.decisoesNoPeriodo, 'decisão', 'decisões')} nos últimos 30 dias, da
              criação da pauta à aprovação ou recusa.
            </p>
          </>
        )}
      </section>
    </>
  );
}
