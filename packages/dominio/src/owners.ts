/**
 * Quem cuida da pauta (RN06): quem cria é owner; qualquer apoiador vira co-owner enquanto houver
 * vaga, até 3 owners ativos (owner + co-owners); owner 30 dias sem responder perde o papel e a vaga
 * é oferecida aos apoiadores (RF-A03). A linha do papel nunca é apagada: sair é preencher `ate`.
 */
import { and, apoios, eq, papeisPauta, pautas, sql, type Tx } from '@lumens/db';
import { registrarEvento } from './eventos';

export const LIMITE_DE_OWNERS = 3;
export const DIAS_SEM_ATIVIDADE = 30;

const MS_POR_DIA = 86_400_000;

/** Papel ainda em vigor: sem data de saída. */
const ativo = sql`${papeisPauta.ate} is null`;

export type ResultadoCoOwner =
  | { adicionado: true }
  | {
      adicionado: false;
      motivo: 'pauta_inexistente' | 'nao_apoiou' | 'ja_e_owner' | 'limite_de_owners';
    };

/** Apoiador vira co-owner, se houver vaga. Recusas voltam como resultado, sem exceção. */
export async function adicionarCoOwner(
  tx: Tx,
  {
    pautaId,
    estudanteId,
    agora = new Date(),
  }: { pautaId: string; estudanteId: string; agora?: Date },
): Promise<ResultadoCoOwner> {
  // FOR UPDATE na pauta: dois pedidos simultâneos para a última vaga contam um depois do outro.
  const [pauta] = await tx
    .select({ id: pautas.id })
    .from(pautas)
    .where(eq(pautas.id, pautaId))
    .for('update');
  if (pauta === undefined) return { adicionado: false, motivo: 'pauta_inexistente' };

  const [apoio] = await tx
    .select({ estudanteId: apoios.estudanteId })
    .from(apoios)
    .where(and(eq(apoios.pautaId, pautaId), eq(apoios.estudanteId, estudanteId)));
  if (apoio === undefined) return { adicionado: false, motivo: 'nao_apoiou' };

  const ativos = await tx
    .select({ estudanteId: papeisPauta.estudanteId })
    .from(papeisPauta)
    .where(and(eq(papeisPauta.pautaId, pautaId), ativo));

  if (ativos.some((o) => o.estudanteId === estudanteId)) {
    return { adicionado: false, motivo: 'ja_e_owner' };
  }
  if (ativos.length >= LIMITE_DE_OWNERS) return { adicionado: false, motivo: 'limite_de_owners' };

  await tx.insert(papeisPauta).values({
    pautaId,
    estudanteId,
    papel: 'co_owner',
    desde: agora.toISOString(),
    ultimaAtividadeEm: agora,
  });
  await registrarEvento(tx, {
    pautaId,
    tipo: 'owner_entrou',
    dados: { papel: 'co_owner' },
    origem: 'bot',
  });

  return { adicionado: true };
}

/** Owner mandou mensagem ao bot: renova o prazo dos 30 dias. Quem não é owner ativo é ignorado. */
export async function registrarAtividadeOwner(
  tx: Tx,
  {
    pautaId,
    estudanteId,
    agora = new Date(),
  }: { pautaId: string; estudanteId: string; agora?: Date },
): Promise<void> {
  await tx
    .update(papeisPauta)
    .set({ ultimaAtividadeEm: agora })
    .where(and(eq(papeisPauta.pautaId, pautaId), eq(papeisPauta.estudanteId, estudanteId), ativo));
}

/**
 * Tira o papel de quem está há 30 dias completos ou mais sem atividade (chamada pelo agendador).
 * Grava `ate` (a linha fica no histórico) e um `owner_removido` por pessoa. `vagaAberta` diz ao
 * bot que pode oferecer a vaga aos apoiadores.
 */
export async function removerOwnerInativo(
  tx: Tx,
  { pautaId, agora = new Date() }: { pautaId: string; agora?: Date },
): Promise<{ removidos: number; vagaAberta: boolean }> {
  const limite = new Date(agora.getTime() - DIAS_SEM_ATIVIDADE * MS_POR_DIA);

  const removidos = await tx
    .update(papeisPauta)
    .set({ ate: agora })
    .where(
      and(
        eq(papeisPauta.pautaId, pautaId),
        ativo,
        sql`${papeisPauta.ultimaAtividadeEm} <= ${limite.toISOString()}::timestamptz`,
      ),
    )
    .returning({ papel: papeisPauta.papel });

  for (const { papel } of removidos) {
    await registrarEvento(tx, {
      pautaId,
      tipo: 'owner_removido',
      dados: { papel },
      origem: 'agendador',
    });
  }

  return { removidos: removidos.length, vagaAberta: removidos.length > 0 };
}
