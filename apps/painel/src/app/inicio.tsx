import Link from 'next/link';
import type { ResumoDaCuradoria, VisaoGeralDaCuradoria } from '@lumens/dominio';
import estilos from './painel.module.css';
import { COR_NO_PAINEL, STATUS } from './pautas/status';

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/**
 * Um indicador do resumo, na mesma pilha alinhada à esquerda: o nome da fila, o número grande, a
 * unidade e o detalhe. O indicador inteiro é um link; separados por filetes, sem cartões.
 */
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
    <li className={[estilos.indicador, alerta ? estilos.indicadorAlerta : ''].join(' ').trim()}>
      <Link href={href}>
        <span className={estilos.indicadorTitulo}>{titulo}</span>
        <b className={estilos.indicadorNumero}>{numero}</b>
        <span className={estilos.indicadorUnidade}>{unidade}</span>
        {detalhe && <span className={estilos.indicadorDetalhe}>{detalhe}</span>}
      </Link>
    </li>
  );
}

const HORA_MS = 3_600_000;

/** Tempo médio até a decisão em horas e minutos, ou dias quando passa de 48 h. */
export function textoDoTempoMedio(ms: number): string {
  const horas = ms / HORA_MS;
  if (horas >= 48) return `${String(Math.round(horas / 24))} dias`;
  if (horas >= 1) return `${horas.toFixed(1).replace('.', ',')}\u00a0h`;
  return `${String(Math.max(1, Math.round(ms / 60_000)))}\u00a0min`;
}

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** `2030-01-07` → `07 jan` (a semana começa na segunda, em UTC). */
export function rotuloDaSemana(semana: string): string {
  const [, mes, dia] = semana.split('-');
  return `${dia ?? ''} ${MES[Number(mes) - 1] ?? ''}`;
}

/** A ordem das barras de status: do começo ao fim da vida da pauta; só entram as que têm pauta. */
const ORDEM_DAS_BARRAS = [
  'em_curadoria',
  'juntando_apoios',
  'meta_batida',
  'cobrando',
  'prometido',
  'entregue_em_parte',
  'conquistada',
  'descumprida',
  'recusada',
] as const;

/** Linhas "rótulo, barra e número": o número está sempre escrito, a barra só ajuda. */
function Barras({
  itens,
}: {
  itens: { chave: string; href: string; cor: string; rotulo: string; valor: number }[];
}) {
  const maior = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className={estilos.barras}>
      {itens.map((i) => (
        <li key={i.chave}>
          <Link href={i.href}>
            <span className={estilos.barrasRotulo}>
              <i style={{ background: i.cor }} aria-hidden="true" />
              <span>{i.rotulo}</span>
            </span>
            <progress
              value={i.valor}
              max={maior}
              style={{ '--c': i.cor } as React.CSSProperties}
              aria-hidden="true"
            />
            <strong className={estilos.barrasNumero}>{i.valor}</strong>
          </Link>
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
  const totais = new Map(visao.pautasPorStatus.map((s) => [s.status, s.total]));
  const maiorSemana = Math.max(1, ...visao.apoiosPorSemana.map((s) => s.apoios));
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
              ? 'Nenhuma atrasada no prazo de 24\u00a0h'
              : `${String(atrasadas)} ${plural(atrasadas, 'pauta atrasada', 'pautas atrasadas')} no prazo de 24\u00a0h${
                  perto === 0
                    ? ''
                    : ` · ${String(perto)} ${plural(perto, 'vence', 'vencem')} nas próximas 6\u00a0h`
                }`
          }
          alerta={atrasadas > 0}
        />
        <Indicador
          href="/relatos"
          titulo="Relatos a moderar"
          numero={resumo.relatosAModerar}
          unidade="em pautas publicadas"
        />
        <Indicador
          href="/pautas?status=cobrando&pendencia=sem_resposta_oficial"
          titulo="Em cobrança sem resposta oficial"
          numero={resumo.pautasSemRespostaOficial}
          unidade={plural(resumo.pautasSemRespostaOficial, 'pauta', 'pautas')}
        />
        <Indicador
          href="/pautas?status=todas&pendencia=conferencia_aberta"
          titulo="Conferências abertas"
          numero={resumo.conferenciasAbertas}
          unidade={plural(resumo.conferenciasAbertas, 'conferência', 'conferências')}
          detalhe="Quem apoiou responde “Foi feito?” por 7 dias"
        />
      </ul>

      <div className={estilos.duas}>
        <section aria-labelledby="visao-status">
          <h2 id="visao-status">Pautas por status</h2>
          <Barras
            itens={ORDEM_DAS_BARRAS.filter((s) => (totais.get(s) ?? 0) > 0).map((s) => ({
              chave: s,
              href: `/pautas?status=${s}`,
              cor: COR_NO_PAINEL[s],
              rotulo: STATUS[s],
              valor: totais.get(s) ?? 0,
            }))}
          />
        </section>

        <section aria-labelledby="visao-apoios">
          <h2 id="visao-apoios">Apoios por semana</h2>
          <ol className={estilos.colunas} aria-label="Apoios por semana">
            {visao.apoiosPorSemana.map((s, i) => (
              <li
                key={s.semana}
                style={
                  { '--f': (s.apoios / maiorSemana).toFixed(3), '--i': i } as React.CSSProperties
                }
              >
                <b>
                  {s.apoios}
                  <span className={estilos.vh}>
                    {' '}
                    {s.apoios === 1 ? 'apoio' : 'apoios'}, semana de
                  </span>
                </b>
                <i aria-hidden="true" />
                <small>{rotuloDaSemana(s.semana)}</small>
              </li>
            ))}
          </ol>
          <p className={estilos.detalhes}>
            {visao.tempoMedioAteDecisaoMs === null ? (
              'Nenhuma decisão nos últimos 30 dias.'
            ) : (
              <>
                Tempo médio até a decisão: <b>{textoDoTempoMedio(visao.tempoMedioAteDecisaoMs)}</b>
              </>
            )}
          </p>
        </section>
      </div>
    </>
  );
}
