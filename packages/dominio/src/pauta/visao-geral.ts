/**
 * Visão geral da curadoria (SCRUM-363): o que a tela inicial do painel mostra além das contagens de
 * `resumoDaCuradoria` — prazos, pautas por status, apoios por semana e tempo até a decisão.
 */
import { apoios, pautas, sql, type Db, type StatusPauta } from '@lumens/db';

const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;

/** "Perto de vencer": pauta em curadoria cujo prazo de 24 h acaba nas próximas horas. */
export const JANELA_DE_PRAZO_PROXIMO_MS = 6 * HORA_MS;
/** Quantas semanas o gráfico de apoios cobre, contando a atual. */
export const SEMANAS_DE_APOIO = 8;
/** O tempo médio até a decisão olha as decisões dos últimos dias, para refletir o ritmo de agora. */
export const DIAS_DO_TEMPO_MEDIO = 30;

const STATUS_NA_ORDEM: StatusPauta[] = [
  'em_curadoria',
  'juntando_apoios',
  'meta_batida',
  'cobrando',
  'prometido',
  'entregue_em_parte',
  'conquistada',
  'descumprida',
  'recusada',
];

export interface ApoiosDaSemana {
  /** Segunda-feira da semana, em UTC (`AAAA-MM-DD`). */
  semana: string;
  apoios: number;
}

export interface VisaoGeralDaCuradoria {
  /** Pautas em curadoria com o prazo vencendo nas próximas horas (ainda não vencido). */
  pautasPertoDeVencer: number;
  /** Todos os status, inclusive com zero. */
  pautasPorStatus: { status: StatusPauta; total: number }[];
  /** As últimas semanas, da mais antiga para a atual, com zeros nas sem apoio. */
  apoiosPorSemana: ApoiosDaSemana[];
  /** Média entre a criação da pauta e a decisão da curadoria; `null` sem decisões no período. */
  tempoMedioAteDecisaoMs: number | null;
  decisoesNoPeriodo: number;
}

/** Segunda-feira, 00:00 UTC, da semana de `instante`. */
function inicioDaSemana(instante: Date): Date {
  const dia = new Date(
    Date.UTC(instante.getUTCFullYear(), instante.getUTCMonth(), instante.getUTCDate()),
  );
  const desdeSegunda = (dia.getUTCDay() + 6) % 7;
  return new Date(dia.getTime() - desdeSegunda * DIA_MS);
}

const dia = (d: Date) => d.toISOString().slice(0, 10);

export async function visaoGeralDaCuradoria(
  db: Db,
  agora = new Date(),
): Promise<VisaoGeralDaCuradoria> {
  const instante = agora.toISOString();
  const primeiraSemana = new Date(
    inicioDaSemana(agora).getTime() - (SEMANAS_DE_APOIO - 1) * 7 * DIA_MS,
  );
  const [perto, porStatus, porSemana, decisoes] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(pautas)
      .where(
        sql`${pautas.status} = 'em_curadoria'
          and ${pautas.criadaEm} + interval '24 hours' >= ${instante}::timestamptz
          and ${pautas.criadaEm} + interval '24 hours' <= ${new Date(agora.getTime() + JANELA_DE_PRAZO_PROXIMO_MS).toISOString()}::timestamptz`,
      ),
    db
      .select({ status: pautas.status, total: sql<number>`count(*)::int` })
      .from(pautas)
      .groupBy(pautas.status),
    db
      .select({
        semana: sql<string>`to_char(date_trunc('week', ${apoios.criadoEm} at time zone 'UTC'), 'YYYY-MM-DD')`,
        total: sql<number>`count(*)::int`,
      })
      .from(apoios)
      .where(
        sql`${apoios.criadoEm} >= ${primeiraSemana.toISOString()}::timestamptz
          and ${apoios.criadoEm} <= ${instante}::timestamptz`,
      )
      .groupBy(sql`1`),
    db.execute(sql`
      select (avg(extract(epoch from (e.criado_em - p.criada_em)) * 1000))::float8 as media_ms,
             count(*)::int as total
      from evento e
      join pauta p on p.id = e.pauta_id
      where e.tipo in ('pauta_aprovada', 'pauta_recusada')
        and e.criado_em >= ${new Date(agora.getTime() - DIAS_DO_TEMPO_MEDIO * DIA_MS).toISOString()}::timestamptz
        and e.criado_em <= ${instante}::timestamptz
    `),
  ]);

  const contagem = new Map(porStatus.map((l) => [l.status, l.total]));
  const apoiosDaSemana = new Map(porSemana.map((l) => [l.semana, l.total]));
  const { rows } = decisoes as { rows: { media_ms: number | null; total: number }[] };
  const decisao = rows[0];
  return {
    pautasPertoDeVencer: perto[0]?.total ?? 0,
    pautasPorStatus: STATUS_NA_ORDEM.map((status) => ({
      status,
      total: contagem.get(status) ?? 0,
    })),
    apoiosPorSemana: Array.from({ length: SEMANAS_DE_APOIO }, (_, i) => {
      const semana = dia(new Date(primeiraSemana.getTime() + i * 7 * DIA_MS));
      return { semana, apoios: apoiosDaSemana.get(semana) ?? 0 };
    }),
    tempoMedioAteDecisaoMs:
      decisao?.media_ms === null || decisao === undefined ? null : Math.round(decisao.media_ms),
    decisoesNoPeriodo: decisao?.total ?? 0,
  };
}
