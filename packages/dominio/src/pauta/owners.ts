/**
 * Quem cuida da pauta (RN06): quem cria é owner; qualquer apoiador vira co-owner enquanto houver
 * vaga, até 3 owners ativos (owner + co-owners); owner 30 dias sem responder perde o papel e a vaga
 * é oferecida aos apoiadores (RF-A03). A linha do papel nunca é apagada: sair é preencher `ate`.
 */
import {
  and,
  apoios,
  eq,
  estudantes,
  inArray,
  papeisPauta,
  pautas,
  sql,
  type Tx,
} from '@lumens/db';
import { registrarEvento } from '../compartilhado/eventos';

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

  // FOR UPDATE no estudante: serializa com sairDoLumens para impedir co-owner de quem está saindo.
  const [estudante] = await tx
    .select({ saiuEm: estudantes.saiuEm })
    .from(estudantes)
    .where(eq(estudantes.id, estudanteId))
    .for('update');
  if (estudante === undefined || estudante.saiuEm !== null) {
    return { adicionado: false, motivo: 'nao_apoiou' };
  }

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
 * Qualquer mensagem ao bot conta como atividade em todas as pautas que a pessoa cuida (decisão 6
 * de `docs/decisoes/SCRUM-80-decisoes-da-equipe.md`: "nenhuma mensagem do owner ao bot em 30 dias"). Chamada pelo worker da
 * conversa, na transação da mensagem, com o HMAC do telefone de quem escreveu.
 *
 * Sem isto, `ultima_atividade_em` ficaria parada no dia em que a pessoa virou owner, e o agendador
 * avisaria e removeria quem conversa com o bot todo dia. Quem não é estudante ou não é owner ativo
 * não muda nada. Devolve quantos papéis foram renovados.
 */
export async function registrarAtividadePorTelefone(
  tx: Tx,
  { telefoneHmac, agora = new Date() }: { telefoneHmac: string; agora?: Date },
): Promise<number> {
  const renovados = await tx
    .update(papeisPauta)
    .set({ ultimaAtividadeEm: agora })
    .where(
      and(
        ativo,
        sql`${papeisPauta.estudanteId} in (select ${estudantes.id} from ${estudantes}
          where ${estudantes.telefoneHmac} = ${telefoneHmac})`,
        // Mensagem atrasada na fila não volta o relógio de quem já falou depois.
        sql`${papeisPauta.ultimaAtividadeEm} < ${agora.toISOString()}::timestamptz`,
      ),
    )
    .returning({ pautaId: papeisPauta.pautaId });
  return renovados.length;
}

/**
 * Tira o papel de quem está há 30 dias completos ou mais sem atividade (chamada pelo agendador).
 * Grava `ate` (a linha fica no histórico) e um `owner_removido` por pessoa. `vagaAberta` diz ao
 * bot que pode oferecer a vaga aos apoiadores.
 *
 * `estudanteIds` restringe a remoção a essas pessoas: o agendador só tira quem já foi avisado
 * (`removerOwnersAvisados`). Sem ele, sai todo owner da pauta que passou dos 30 dias.
 */
export async function removerOwnerInativo(
  tx: Tx,
  {
    pautaId,
    agora = new Date(),
    estudanteIds,
  }: { pautaId: string; agora?: Date; estudanteIds?: readonly string[] },
): Promise<{ removidos: number; vagaAberta: boolean }> {
  if (estudanteIds?.length === 0) return { removidos: 0, vagaAberta: false };
  const limite = new Date(agora.getTime() - DIAS_SEM_ATIVIDADE * MS_POR_DIA);

  const removidos = await tx
    .update(papeisPauta)
    .set({ ate: agora })
    .where(
      and(
        eq(papeisPauta.pautaId, pautaId),
        ativo,
        sql`${papeisPauta.ultimaAtividadeEm} <= ${limite.toISOString()}::timestamptz`,
        estudanteIds === undefined
          ? undefined
          : inArray(papeisPauta.estudanteId, [...estudanteIds]),
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
