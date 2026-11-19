/**
 * Corrigir o título ou a descrição da própria pauta (pedido da equipe, validação final).
 *
 * Quem cria a pauta é o owner. Esquecer algo ou errar uma palavra acontece, então o owner pode
 * reescrever o título ou a descrição **enquanto a pauta está em curadoria** (`STATUS_EDITAVEIS`): o
 * texto corrigido é o que a curadoria vai avaliar. Por garantia, também recusa se outra pessoa já
 * apoiou (o apoio do próprio owner não conta). Bloco e categoria não mudam por aqui (o bloco mexe
 * na meta, que é congelada). Depois da publicação a edição vira um pedido que a curadoria aprova
 * (`pedido-edicao.ts`); `pautasEditaveisDoOwner` lista as pautas das duas situações.
 */
import { createHash } from 'node:crypto';
import { and, apoios, eq, isNull, papeisPauta, pautas, sql, type Db, type Tx } from '@lumens/db';
import { registrarEvento } from '../compartilhado/eventos';
import { DESCRICAO_MAXIMA, TITULO_MAXIMO } from './pauta';

/**
 * A "versão" do texto de uma pauta: um resumo do título e da descrição. A tela da curadoria leva
 * a versão do texto que mostra, e a aprovação só vale se o texto no banco ainda tiver a mesma:
 * quem aprova nunca publica um texto que o autor mudou depois de a tela abrir. Sai do próprio
 * texto exibido, e não de um contador lido à parte, para não existir brecha entre duas leituras.
 */
export function versaoDoTexto(titulo: string, descricao: string): string {
  return createHash('sha256')
    .update(JSON.stringify([titulo, descricao]))
    .digest('hex');
}

/**
 * Status em que o texto muda direto: só enquanto a curadoria ainda não decidiu, porque o texto
 * corrigido é o que ela vai avaliar. Depois de publicada, a edição vira um pedido que a curadoria
 * aprova (`pedido-edicao.ts`).
 */
export const STATUS_EDITAVEIS = ['em_curadoria'] as const;

const tamanho = (texto: string) => Array.from(texto).length;

export interface PautaEditavel {
  id: string;
  titulo: string;
  status: string;
}

/** Pautas do owner que ainda podem ter título ou descrição corrigidos (direto ou por pedido), a mais nova primeiro. */
export async function pautasEditaveisDoOwner(
  db: Db,
  estudanteId: string,
): Promise<PautaEditavel[]> {
  return db
    .select({ id: pautas.id, titulo: pautas.titulo, status: pautas.status })
    .from(papeisPauta)
    .innerJoin(pautas, eq(pautas.id, papeisPauta.pautaId))
    .where(
      and(
        eq(papeisPauta.estudanteId, estudanteId),
        eq(papeisPauta.papel, 'owner'),
        isNull(papeisPauta.ate),
        // Em curadoria, só sem apoio de outra pessoa (o apoio do próprio owner não conta); publicada,
        // qualquer status menos recusada: a edição vira pedido para a curadoria.
        sql`${pautas.status} <> 'recusada'`,
        sql`(${pautas.status} <> 'em_curadoria' OR NOT EXISTS (SELECT 1 FROM apoio a WHERE a.pauta_id = ${pautas.id} AND a.estudante_id <> ${estudanteId}))`,
      ),
    )
    .orderBy(sql`${pautas.criadaEm} DESC`);
}

export type CampoEditavel = 'titulo' | 'descricao';

export type ResultadoEdicao =
  | { editada: true }
  | {
      editada: false;
      motivo: 'texto_vazio' | 'texto_longo' | 'nao_e_owner' | 'pauta_fechada' | 'ja_tem_apoio';
    };

/**
 * Troca o título ou a descrição. Confere tudo de novo dentro da transação: entre a pergunta e a
 * resposta, a pauta muda. O texto de antes e o de depois vão para a linha do tempo (só a curadoria
 * vê), para ela saber o que mudou. Texto igual ao atual não grava nada e vale como editado.
 */
export async function editarPautaEmCuradoria(
  tx: Tx,
  {
    pautaId,
    estudanteId,
    campo,
    texto,
  }: { pautaId: string; estudanteId: string; campo: CampoEditavel; texto: string },
): Promise<ResultadoEdicao> {
  const limpo = texto.trim();
  if (limpo === '') return { editada: false, motivo: 'texto_vazio' };
  const maximo = campo === 'titulo' ? TITULO_MAXIMO : DESCRICAO_MAXIMA;
  if (tamanho(limpo) > maximo) return { editada: false, motivo: 'texto_longo' };

  // FOR UPDATE: um apoio ou uma decisão da curadoria que chega junto espera esta edição terminar.
  const [pauta] = await tx
    .select({ status: pautas.status, titulo: pautas.titulo, descricao: pautas.descricao })
    .from(pautas)
    .where(eq(pautas.id, pautaId))
    .for('update');
  if (pauta === undefined || !(STATUS_EDITAVEIS as readonly string[]).includes(pauta.status)) {
    return { editada: false, motivo: 'pauta_fechada' };
  }
  const [papel] = await tx
    .select({ id: papeisPauta.estudanteId })
    .from(papeisPauta)
    .where(
      and(
        eq(papeisPauta.pautaId, pautaId),
        eq(papeisPauta.estudanteId, estudanteId),
        eq(papeisPauta.papel, 'owner'),
        isNull(papeisPauta.ate),
      ),
    );
  if (papel === undefined) return { editada: false, motivo: 'nao_e_owner' };
  const [outro] = await tx
    .select({ pautaId: apoios.pautaId })
    .from(apoios)
    .where(and(eq(apoios.pautaId, pautaId), sql`${apoios.estudanteId} <> ${estudanteId}`))
    .limit(1);
  if (outro !== undefined) return { editada: false, motivo: 'ja_tem_apoio' };

  const antes = campo === 'titulo' ? pauta.titulo : pauta.descricao;
  if (antes === limpo) return { editada: true };
  await tx
    .update(pautas)
    .set(campo === 'titulo' ? { titulo: limpo } : { descricao: limpo })
    .where(eq(pautas.id, pautaId));
  await registrarEvento(tx, {
    pautaId,
    tipo: 'pauta_editada',
    dados: { campo, antes, depois: limpo },
    origem: 'bot',
  });
  return { editada: true };
}
