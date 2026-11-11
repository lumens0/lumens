/**
 * Linha do tempo completa da pauta para a curadoria (5.5): todos os eventos, inclusive os que não
 * vão para o site. Só leitura: o banco recusa UPDATE e DELETE em `evento` (migração 0002), então
 * não existe, nem aqui nem no painel, ação de editar ou apagar.
 */
import { eq, eventos, type Db } from '@lumens/db';
import type { OrigemEvento } from '../compartilhado/eventos';

export interface EventoDaLinha {
  id: string;
  tipo: string;
  dados: Record<string, unknown>;
  origem: OrigemEvento;
  publico: boolean;
  criadoEm: Date;
}

/**
 * Eventos da pauta, do mais antigo para o mais novo. Pauta sem eventos ou inexistente dá lista vazia.
 *
 * Eventos da mesma ação têm o mesmo `criado_em` (o `now()` é o início da transação); a `seq`, que
 * cresce a cada evento gravado, desempata na ordem em que aconteceram.
 */
export function listarLinhaDoTempo(db: Db, pautaId: string): Promise<EventoDaLinha[]> {
  return db
    .select({
      id: eventos.id,
      tipo: eventos.tipo,
      dados: eventos.dados,
      origem: eventos.origem,
      publico: eventos.publico,
      criadoEm: eventos.criadoEm,
    })
    .from(eventos)
    .where(eq(eventos.pautaId, pautaId))
    .orderBy(eventos.criadoEm, eventos.seq);
}
