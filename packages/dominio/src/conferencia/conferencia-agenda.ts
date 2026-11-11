/**
 * Abertura e fecho da conferência "Foi feito?" pelo agendador (RN10, SCRUM-238).
 *
 * `registrarPromessa` só grava a janela; nada acontece na data sem alguém olhar o relógio. Aqui
 * ficam os dois atos que o agendador faz por ela:
 *
 * - **abrir:** na data de entrega, registra `conferencia_aberta` e põe na fila de envio o aviso
 *   para cada apoiador;
 * - **fechar:** passada a janela, apura pela `encerrarConferencia` — ou, se a primeira rodada
 *   ficar sem quórum, reabre uma única vez por mais sete dias (decisão 4 de `docs/decisoes.md`).
 *
 * As duas são idempotentes e se guiam pelo estado, não pelo horário em que rodam: um agendador
 * que ficou fora do ar faz na volta o que deixou de fazer (SCRUM-239).
 */
import {
  and,
  apoios,
  eq,
  estudantes,
  eventos,
  isNull,
  pautas,
  promessas,
  respostasConferencia,
  sql,
  type Db,
  type Tx,
} from '@lumens/db';
import { encerrarConferencia, type ResultadoEncerramento } from './conferencia-apuracao';
import { formatarDia, meiaNoiteEmOuDepois, ultimoDiaAntesDe } from '../compartilhado/datas';
import { registrarEvento } from '../compartilhado/eventos';
import { enfileirarDisparos } from '../avisos/fila';
import { DIAS_DE_CONFERENCIA } from '../caminhos/promessa';

const MS_POR_DIA = 86_400_000;
const JANELA_MS = DIAS_DE_CONFERENCIA * MS_POR_DIA;

/** Atraso de abertura que não mexe no fecho: o intervalo normal entre execuções do agendador. */
const ATRASO_TOLERADO_MS = 3_600_000;

/** Fim de uma janela de sete dias que começa agora, alinhado à meia-noite de Maceió. */
const seteDiasAPartirDe = (agora: Date) =>
  meiaNoiteEmOuDepois(new Date(agora.getTime() + JANELA_MS));

/** Mensagem modelo da conferência (SCRUM-193): título, data prometida, resumo, último dia. */
export const MODELO_CONFERENCIA = 'lumens_conferencia';

/**
 * Quantas vezes `conferencia_aberta` já foi registrada para a promessa: 0 nunca abriu, 1 abriu,
 * 2 reabriu. Aceita o id como valor ou como a coluna da consulta de fora.
 */
const aberturasDa = (promessaId: string | ReturnType<typeof sql>) =>
  sql<number>`(select count(*)::int from ${eventos}
    where ${eventos.tipo} = 'conferencia_aberta'
    and ${eventos.dados} ->> 'promessa_id' = ${promessaId})`;

const aberturasDestaLinha = aberturasDa(sql`${promessas.id}::text`);

/** Promessas cuja conferência já devia ter aberto e ainda não abriu. */
export async function promessasParaAbrir(db: Db | Tx, agora: Date): Promise<string[]> {
  const linhas = await db
    .select({ id: promessas.id })
    .from(promessas)
    .where(
      and(
        isNull(promessas.resultado),
        sql`${promessas.conferenciaAbreEm} <= ${agora.toISOString()}::timestamptz`,
        sql`${aberturasDestaLinha} = 0`,
      ),
    );
  return linhas.map((l) => l.id);
}

/** Promessas abertas cuja janela já fechou e que ainda não foram apuradas. */
export async function promessasParaFechar(db: Db | Tx, agora: Date): Promise<string[]> {
  const linhas = await db
    .select({ id: promessas.id })
    .from(promessas)
    .where(
      and(
        isNull(promessas.resultado),
        sql`${promessas.conferenciaFechaEm} <= ${agora.toISOString()}::timestamptz`,
        sql`${aberturasDestaLinha} > 0`,
      ),
    );
  return linhas.map((l) => l.id);
}

export type ResultadoAbertura =
  | { aberta: true; fechaEm: Date; avisos: number }
  | { aberta: false; motivo: 'promessa_inexistente' | 'ainda_nao' | 'ja_aberta' | 'ja_apurada' };

/**
 * Abre a conferência: registra o evento e enfileira o aviso para quem apoiava na data.
 *
 * Se o agendador abrir com mais de uma hora de atraso, o fecho anda junto: a janela passa a
 * terminar na meia-noite que completa sete dias da abertura de fato. Quem apoiou tem a semana
 * inteira para responder, e o atraso não empurra a apuração para o "sem quórum".
 */
export async function abrirConferencia(
  tx: Tx,
  { promessaId, agora = new Date() }: { promessaId: string; agora?: Date },
): Promise<ResultadoAbertura> {
  const promessa = await travarPromessa(tx, promessaId);
  if (promessa === undefined) return { aberta: false, motivo: 'promessa_inexistente' };
  if (promessa.resultado !== null) return { aberta: false, motivo: 'ja_apurada' };
  if (agora < promessa.abreEm) return { aberta: false, motivo: 'ainda_nao' };
  if (promessa.aberturas > 0) return { aberta: false, motivo: 'ja_aberta' };

  const atrasou = agora.getTime() - promessa.abreEm.getTime() > ATRASO_TOLERADO_MS;
  const fechaEm = atrasou
    ? new Date(Math.max(promessa.fechaEm.getTime(), seteDiasAPartirDe(agora).getTime()))
    : promessa.fechaEm;
  if (fechaEm.getTime() !== promessa.fechaEm.getTime()) {
    await tx
      .update(promessas)
      .set({ conferenciaFechaEm: fechaEm })
      .where(eq(promessas.id, promessaId));
  }

  await registrarEvento(tx, {
    pautaId: promessa.pautaId,
    tipo: 'conferencia_aberta',
    dados: { promessa_id: promessaId, fecha_em: fechaEm.toISOString() },
    origem: 'agendador',
  });

  const destinatarios = await apoiadoresAteAbrir(tx, promessa);
  const avisos = await enfileirarAvisos(tx, promessa, destinatarios, promessaId, fechaEm, agora);
  return { aberta: true, fechaEm, avisos };
}

export type ResultadoFecho =
  | ResultadoEncerramento
  | { apurada: false; motivo: 'reaberta'; fechaEm: Date; avisos: number }
  | { apurada: false; motivo: 'nao_aberta' };

/** Sinal interno para desfazer o savepoint da apuração quando a conferência vai reabrir. */
class Reabrir extends Error {}

/**
 * Fecha a conferência que venceu.
 *
 * Na primeira rodada, um resultado sem quórum não é gravado: a conferência reabre por mais sete
 * dias, a contar de agora e fechando à meia-noite, e só quem ainda não respondeu recebe o aviso de
 * novo. Na segunda
 * rodada, o resultado da apuração vale como vier, inclusive `sem_quorum`.
 *
 * A apuração roda num savepoint para que a regra continue num lugar só (`encerrarConferencia`):
 * se o resultado for reabrir, tudo o que ela gravou é desfeito antes de reabrir.
 */
export async function fecharConferencia(
  tx: Tx,
  { promessaId, agora = new Date() }: { promessaId: string; agora?: Date },
): Promise<ResultadoFecho> {
  const promessa = await travarPromessa(tx, promessaId);
  if (promessa === undefined) return { apurada: false, motivo: 'promessa_inexistente' };
  if (promessa.aberturas === 0 && promessa.resultado === null) {
    return { apurada: false, motivo: 'nao_aberta' };
  }

  const primeiraRodada = promessa.aberturas === 1;
  try {
    return await tx.transaction(async (savepoint) => {
      const apuracao = await encerrarConferencia(savepoint, { promessaId, agora });
      if (primeiraRodada && apuracao.apurada && apuracao.resultado === 'sem_quorum') {
        throw new Reabrir();
      }
      return apuracao;
    });
  } catch (erro) {
    if (!(erro instanceof Reabrir)) throw erro;
  }

  const fechaEm = seteDiasAPartirDe(agora);
  await tx
    .update(promessas)
    .set({ conferenciaFechaEm: fechaEm })
    .where(eq(promessas.id, promessaId));
  await registrarEvento(tx, {
    pautaId: promessa.pautaId,
    tipo: 'conferencia_aberta',
    dados: { promessa_id: promessaId, fecha_em: fechaEm.toISOString() },
    origem: 'agendador',
  });

  const jaResponderam = new Set(
    (
      await tx
        .select({ estudanteId: respostasConferencia.estudanteId })
        .from(respostasConferencia)
        .where(eq(respostasConferencia.promessaId, promessaId))
    ).map((r) => r.estudanteId),
  );
  const faltam = (await apoiadoresAteAbrir(tx, promessa)).filter((id) => !jaResponderam.has(id));
  // Aviso com outra identidade: o da primeira rodada já saiu para essas pessoas, e a fila
  // descartaria uma cópia com a mesma chave.
  const avisos = await enfileirarAvisos(
    tx,
    promessa,
    faltam,
    `${promessaId}:reaberta`,
    fechaEm,
    agora,
  );

  return { apurada: false, motivo: 'reaberta', fechaEm, avisos };
}

interface PromessaTravada {
  pautaId: string;
  titulo: string;
  resumo: string;
  dataEntrega: string;
  abreEm: Date;
  fechaEm: Date;
  resultado: string | null;
  aberturas: number;
}

/**
 * Lê a promessa com FOR UPDATE: duas execuções do agendador ao mesmo tempo fazem fila aqui.
 *
 * As aberturas são contadas numa consulta separada, DEPOIS da trava. Na mesma consulta, quem
 * esperou pela trava contaria com a foto do banco de antes da espera: no READ COMMITTED o Postgres
 * relê a linha travada, mas não a subconsulta. Duas aberturas simultâneas veriam as duas "0
 * aberturas" e gravariam dois `conferencia_aberta`, e o fecho tomaria a primeira rodada pela
 * segunda, sem reabrir.
 */
async function travarPromessa(tx: Tx, promessaId: string): Promise<PromessaTravada | undefined> {
  const [promessa] = await tx
    .select({
      pautaId: promessas.pautaId,
      titulo: pautas.titulo,
      resumo: promessas.resumo,
      dataEntrega: promessas.dataEntrega,
      abreEm: promessas.conferenciaAbreEm,
      fechaEm: promessas.conferenciaFechaEm,
      resultado: promessas.resultado,
    })
    .from(promessas)
    .innerJoin(pautas, eq(pautas.id, promessas.pautaId))
    .where(eq(promessas.id, promessaId))
    .for('update', { of: promessas });
  if (promessa === undefined) return undefined;

  const [contagem] = await tx
    .select({ aberturas: aberturasDa(promessaId) })
    .from(promessas)
    .where(eq(promessas.id, promessaId));
  return { ...promessa, aberturas: contagem?.aberturas ?? 0 };
}

/**
 * Quem apoiava quando a conferência abriu e ainda está no sistema. É o mesmo corte de
 * `encerrarConferencia`: quem apoiou depois não entra na apuração, então não é chamado a votar.
 */
async function apoiadoresAteAbrir(tx: Tx, promessa: PromessaTravada): Promise<string[]> {
  const linhas = await tx
    .select({ estudanteId: apoios.estudanteId })
    .from(apoios)
    .innerJoin(estudantes, eq(estudantes.id, apoios.estudanteId))
    .where(
      and(
        eq(apoios.pautaId, promessa.pautaId),
        sql`${apoios.criadoEm} <= ${promessa.abreEm.toISOString()}::timestamptz`,
        isNull(estudantes.saiuEm),
      ),
    );
  return linhas.map((l) => l.estudanteId);
}

function enfileirarAvisos(
  tx: Tx,
  promessa: PromessaTravada,
  destinatarios: readonly string[],
  aviso: string,
  fechaEm: Date,
  agora: Date,
): Promise<number> {
  const parametros = [
    promessa.titulo,
    formatarDia(promessa.dataEntrega),
    promessa.resumo,
    ultimoDiaAntesDe(fechaEm),
  ];
  return enfileirarDisparos(
    tx,
    destinatarios.map((estudanteId) => ({
      tipo: 'conferencia' as const,
      aviso,
      estudanteId,
      modelo: MODELO_CONFERENCIA,
      parametros,
    })),
    agora,
  );
}
