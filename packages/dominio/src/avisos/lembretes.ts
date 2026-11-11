/**
 * Lembretes aos responsáveis pela pauta, chamados pelo agendador (3.8, SCRUM-238).
 *
 * - **Prazo do Fala.BR:** cinco dias antes de vencer o prazo dos 30+30, quem cuida da pauta recebe
 *   o lembrete, enquanto não chegar resposta oficial.
 * - **Owner inativo:** no dia 25 sem mensagem ao bot, o owner recebe um aviso preventivo; no dia
 *   30, perde o papel (decisão 6 de `docs/decisoes.md`, RF-A03). A remoção exige o aviso: quem
 *   não foi avisado há pelo menos cinco dias não sai, mesmo passado o dia 30 (SCRUM-239).
 *
 * Tudo aqui só enfileira na fila de envio (`fila.ts`), que decide quando sai dentro do limite da
 * Meta. Repetir a chamada não repete o aviso: a fila não aceita o mesmo aviso duas vezes.
 */
import {
  and,
  caminhos,
  disparos,
  eq,
  eventos,
  inArray,
  isNull,
  papeisPauta,
  pautas,
  sql,
  type Tx,
} from '@lumens/db';
import { diaEmMaceio, formatarDia } from '../compartilhado/datas';
import { enfileirarDisparos, type NovoAviso } from './fila';
import { DIAS_SEM_ATIVIDADE, removerOwnerInativo } from '../pauta/owners';
import { diasAteOPrazo } from '../caminhos/prazo';

const MS_POR_DIA = 86_400_000;

/** Quantos dias antes do vencimento do Fala.BR sai o lembrete. */
export const DIAS_DE_ANTECEDENCIA_DO_PRAZO = 5;

/** Dia sem atividade em que o owner recebe o aviso preventivo. */
export const DIA_DO_AVISO_DE_INATIVIDADE = 25;

/** Tempo mínimo entre o aviso preventivo e a remoção. */
const AVISO_ANTES_DA_REMOCAO_MS = (DIAS_SEM_ATIVIDADE - DIA_DO_AVISO_DE_INATIVIDADE) * MS_POR_DIA;

/** Mensagens modelo (SCRUM-193). A ordem dos parâmetros segue o corpo e, no fim, o botão. */
export const MODELO_LEMBRETE_PRAZO = 'lumens_lembrete_prazo';
export const MODELO_OWNER_INATIVO = 'lumens_owner_inativo';

/** Status em que a pauta já não tem o que cuidar: não faz sentido cobrar atividade do owner. */
const STATUS_ENCERRADOS = ['recusada', 'conquistada'] as const;

/**
 * Enfileira o lembrete de prazo para os owners das pautas cujo Fala.BR vence nos próximos cinco
 * dias e ainda não teve resposta oficial. Devolve quantos avisos entraram.
 *
 * O aviso leva o prazo na identidade: se a ouvidoria prorrogar, o prazo novo rende outro lembrete.
 * Prazo que já venceu não rende lembrete, nem com o agendador atrasado: avisar de um prazo que
 * passou só confunde, e o vencimento aparece no site (3.4).
 */
export async function enfileirarLembretesDePrazo(
  tx: Tx,
  { agora = new Date() }: { agora?: Date } = {},
): Promise<number> {
  const hoje = diaEmMaceio(agora);
  const candidatos = await tx
    .select({
      caminhoId: caminhos.id,
      prazo: caminhos.prazo,
      pautaId: pautas.id,
      titulo: pautas.titulo,
      slug: pautas.slug,
    })
    .from(caminhos)
    .innerJoin(pautas, eq(pautas.id, caminhos.pautaId))
    .where(
      and(
        eq(caminhos.tipo, 'falabr'),
        sql`${caminhos.protocolo} is not null`,
        sql`${caminhos.prazo} is not null`,
        eq(pautas.status, 'cobrando'),
        sql`not exists (select 1 from ${eventos}
          where ${eventos.tipo} = 'resposta_oficial_recebida'
          and ${eventos.dados} ->> 'caminho_id' = ${caminhos.id}::text)`,
      ),
    );

  const avisos: NovoAviso[] = [];
  for (const c of candidatos) {
    if (c.prazo === null) continue;
    const faltam = diasAteOPrazo(c.prazo, hoje);
    if (faltam < 0 || faltam > DIAS_DE_ANTECEDENCIA_DO_PRAZO) continue;

    for (const estudanteId of await ownersAtivos(tx, c.pautaId)) {
      avisos.push({
        tipo: 'lembrete',
        aviso: `prazo:${c.caminhoId}:${c.prazo}`,
        estudanteId,
        modelo: MODELO_LEMBRETE_PRAZO,
        parametros: [c.titulo, formatarDia(c.prazo), c.slug],
      });
    }
  }
  return enfileirarDisparos(tx, avisos, agora);
}

interface OwnerParado {
  pautaId: string;
  estudanteId: string;
  titulo: string;
  ultimaAtividadeEm: Date;
}

/**
 * Identidade do aviso de inatividade. Leva o instante da última atividade: se o owner voltar a
 * falar com o bot e sumir de novo, o período novo rende outro aviso.
 */
const avisoDeInatividade = (o: OwnerParado) =>
  `inatividade:${o.pautaId}:${o.ultimaAtividadeEm.toISOString()}`;

/** Owners ativos, de pautas não encerradas, sem atividade há pelo menos `dias`. */
async function ownersParados(tx: Tx, agora: Date, dias: number): Promise<OwnerParado[]> {
  const limite = new Date(agora.getTime() - dias * MS_POR_DIA);
  return tx
    .select({
      pautaId: papeisPauta.pautaId,
      estudanteId: papeisPauta.estudanteId,
      titulo: pautas.titulo,
      ultimaAtividadeEm: papeisPauta.ultimaAtividadeEm,
    })
    .from(papeisPauta)
    .innerJoin(pautas, eq(pautas.id, papeisPauta.pautaId))
    .where(
      and(
        isNull(papeisPauta.ate),
        sql`${papeisPauta.ultimaAtividadeEm} <= ${limite.toISOString()}::timestamptz`,
        sql`${pautas.status} not in ${STATUS_ENCERRADOS}`,
      ),
    );
}

/** Enfileira o aviso preventivo do dia 25. Devolve quantos avisos entraram. */
export async function enfileirarAvisosDeInatividade(
  tx: Tx,
  { agora = new Date() }: { agora?: Date } = {},
): Promise<number> {
  const parados = await ownersParados(tx, agora, DIA_DO_AVISO_DE_INATIVIDADE);
  return enfileirarDisparos(
    tx,
    parados.map((o) => ({
      tipo: 'lembrete' as const,
      aviso: avisoDeInatividade(o),
      estudanteId: o.estudanteId,
      modelo: MODELO_OWNER_INATIVO,
      parametros: [o.titulo, formatarDia(diaEmMaceio(o.ultimaAtividadeEm))],
    })),
    agora,
  );
}

/**
 * Tira o papel de quem passou do dia 30 E foi avisado há pelo menos cinco dias. Devolve quantos
 * saíram.
 *
 * "Avisado" é o aviso deste período de inatividade ter saído (ou falhado de vez, quando o número
 * não recebe mensagem) — não só ter entrado na fila, que pode segurá-lo por falta de cota.
 */
export async function removerOwnersAvisados(
  tx: Tx,
  { agora = new Date() }: { agora?: Date } = {},
): Promise<number> {
  const parados = await ownersParados(tx, agora, DIAS_SEM_ATIVIDADE);
  if (parados.length === 0) return 0;

  const avisadoAte = new Date(agora.getTime() - AVISO_ANTES_DA_REMOCAO_MS);
  const avisados = await tx
    .select({ aviso: disparos.aviso, estudanteId: disparos.estudanteId })
    .from(disparos)
    .where(
      and(
        eq(disparos.tipo, 'lembrete'),
        inArray(disparos.aviso, parados.map(avisoDeInatividade)),
        sql`coalesce(${disparos.enviadoEm}, ${disparos.falhouEm}) <= ${avisadoAte.toISOString()}::timestamptz`,
      ),
    );
  const foiAvisado = new Set(avisados.map((a) => `${a.aviso}\u0000${a.estudanteId}`));

  const porPauta = new Map<string, string[]>();
  for (const o of parados) {
    if (!foiAvisado.has(`${avisoDeInatividade(o)}\u0000${o.estudanteId}`)) continue;
    porPauta.set(o.pautaId, [...(porPauta.get(o.pautaId) ?? []), o.estudanteId]);
  }

  let removidos = 0;
  for (const [pautaId, estudanteIds] of porPauta) {
    removidos += (await removerOwnerInativo(tx, { pautaId, agora, estudanteIds })).removidos;
  }
  return removidos;
}

async function ownersAtivos(tx: Tx, pautaId: string): Promise<string[]> {
  const linhas = await tx
    .select({ estudanteId: papeisPauta.estudanteId })
    .from(papeisPauta)
    .where(and(eq(papeisPauta.pautaId, pautaId), isNull(papeisPauta.ate)));
  return linhas.map((l) => l.estudanteId);
}
