import { and, apoios, blocos, eq, pautas, sql, type Tx } from '@lumens/db';
import { registrarEvento } from '../compartilhado/eventos';
import { calcularMeta, META_MAXIMA, META_MINIMA } from './meta';

type Motivo =
  | 'pauta_inexistente'
  | 'status_invalido'
  | 'bloco_inexistente'
  | 'motivo_obrigatorio'
  | 'meta_invalida'
  | 'meta_abaixo_dos_apoios';
export type ResultadoAjusteMeta = { feito: true } | { feito: false; motivo: Motivo };

function motivoValido(motivo: string, aceitarQuebraDeLinha = false): boolean {
  return (
    motivo.trim() !== '' && motivo.length <= 200 && (aceitarQuebraDeLinha || !/[\r\n]/.test(motivo))
  );
}

async function lerPauta(tx: Tx, pautaId: string) {
  const [pauta] = await tx
    .select({ id: pautas.id, status: pautas.status, blocoId: pautas.blocoId, meta: pautas.meta })
    .from(pautas)
    .where(eq(pautas.id, pautaId))
    .for('update');
  return pauta;
}

async function contarApoios(tx: Tx, pautaId: string): Promise<number> {
  const [resultado] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(apoios)
    .where(eq(apoios.pautaId, pautaId));
  return resultado?.total ?? 0;
}

const STATUS_AJUSTAVEIS = ['em_curadoria', 'juntando_apoios'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function corrigirBloco(
  tx: Tx,
  {
    pautaId,
    blocoId,
    motivo,
  }: {
    pautaId: string;
    curadorId: string;
    blocoId: string | null;
    motivo: string;
    agora?: Date;
  },
): Promise<ResultadoAjusteMeta> {
  if (!UUID.test(pautaId)) return { feito: false, motivo: 'pauta_inexistente' };
  const pauta = await lerPauta(tx, pautaId);
  if (!pauta) return { feito: false, motivo: 'pauta_inexistente' };
  if (!(STATUS_AJUSTAVEIS as readonly string[]).includes(pauta.status))
    return { feito: false, motivo: 'status_invalido' };
  if (!motivoValido(motivo, true)) return { feito: false, motivo: 'motivo_obrigatorio' };

  let blocoDepois: { id: string; nome: string; baseEstudantes: number } | undefined;
  if (blocoId !== null) {
    if (!UUID.test(blocoId)) return { feito: false, motivo: 'bloco_inexistente' };
    [blocoDepois] = await tx
      .select({ id: blocos.id, nome: blocos.nome, baseEstudantes: blocos.baseEstudantes })
      .from(blocos)
      .where(eq(blocos.id, blocoId))
      .limit(1);
    if (!blocoDepois) return { feito: false, motivo: 'bloco_inexistente' };
  }
  const [blocoAntes] =
    pauta.blocoId === null
      ? []
      : await tx
          .select({ nome: blocos.nome })
          .from(blocos)
          .where(eq(blocos.id, pauta.blocoId))
          .limit(1);
  const metaDepois = calcularMeta(blocoDepois ?? null);
  if (metaDepois <= (await contarApoios(tx, pautaId)))
    return { feito: false, motivo: 'meta_abaixo_dos_apoios' };

  await tx.update(pautas).set({ blocoId, meta: metaDepois }).where(eq(pautas.id, pautaId));
  await registrarEvento(tx, {
    pautaId,
    tipo: 'bloco_corrigido',
    origem: 'curadoria',
    dados: {
      blocoAntes: blocoAntes?.nome ?? null,
      blocoDepois: blocoDepois?.nome ?? null,
      metaAntes: pauta.meta,
      metaDepois,
      motivo,
    },
  });
  return { feito: true };
}

export async function ajustarMeta(
  tx: Tx,
  {
    pautaId,
    meta,
    motivo,
  }: {
    pautaId: string;
    curadorId: string;
    meta: number;
    motivo: string;
    agora?: Date;
  },
): Promise<ResultadoAjusteMeta> {
  if (!UUID.test(pautaId)) return { feito: false, motivo: 'pauta_inexistente' };
  const pauta = await lerPauta(tx, pautaId);
  if (!pauta) return { feito: false, motivo: 'pauta_inexistente' };
  if (!(STATUS_AJUSTAVEIS as readonly string[]).includes(pauta.status))
    return { feito: false, motivo: 'status_invalido' };
  if (!Number.isInteger(meta) || meta < META_MINIMA || meta > META_MAXIMA)
    return { feito: false, motivo: 'meta_invalida' };
  if (!motivoValido(motivo)) return { feito: false, motivo: 'motivo_obrigatorio' };
  if (meta <= (await contarApoios(tx, pautaId)))
    return { feito: false, motivo: 'meta_abaixo_dos_apoios' };
  await tx
    .update(pautas)
    .set({ meta })
    .where(and(eq(pautas.id, pautaId), eq(pautas.status, pauta.status)));
  await registrarEvento(tx, {
    pautaId,
    tipo: 'meta_ajustada',
    origem: 'curadoria',
    dados: { metaAntes: pauta.meta, metaDepois: meta, motivo },
  });
  return { feito: true };
}
