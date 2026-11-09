/**
 * Caminhos de cobrança (RN07): Fala.BR e comunidade são independentes, um nunca bloqueia o outro,
 * e podem ser abertos em qualquer ordem, inclusive antes da meta (RN05).
 */
import { and, caminhos, eq, papeisPauta, sql, type Tx } from '@lumens/db';
import { registrarEvento } from './eventos';

export interface NovoCaminho {
  pautaId: string;
  tipo: 'falabr' | 'comunidade';
  /** Quem pediu. Só owner ativo da pauta abre caminho. */
  porEstudanteId: string;
  agora?: Date;
}

export type ResultadoCaminho =
  { aberto: true; caminhoId: string } | { aberto: false; motivo: 'nao_e_owner' };

/** Abre um caminho e registra `caminho_aberto`. Não olha a meta nem os outros caminhos. */
export async function abrirCaminho(
  tx: Tx,
  { pautaId, tipo, porEstudanteId, agora = new Date() }: NovoCaminho,
): Promise<ResultadoCaminho> {
  const [owner] = await tx
    .select({ papel: papeisPauta.papel })
    .from(papeisPauta)
    .where(
      and(
        eq(papeisPauta.pautaId, pautaId),
        eq(papeisPauta.estudanteId, porEstudanteId),
        sql`${papeisPauta.ate} is null`,
      ),
    )
    .limit(1);

  if (owner === undefined) return { aberto: false, motivo: 'nao_e_owner' };

  const [caminho] = await tx
    .insert(caminhos)
    .values({ pautaId, tipo, status: 'aberto', abertoEm: agora })
    .returning({ id: caminhos.id });
  if (caminho === undefined) throw new Error('caminho não criado');

  await registrarEvento(tx, {
    pautaId,
    tipo: 'caminho_aberto',
    dados: { caminho_id: caminho.id, tipo },
    origem: 'bot',
  });

  return { aberto: true, caminhoId: caminho.id };
}
