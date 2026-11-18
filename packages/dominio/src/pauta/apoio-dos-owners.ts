/**
 * Ajuste de dados da SCRUM-348: a aprovação (SCRUM-344) passou a dar ao owner o primeiro apoio da
 * pauta, mas as pautas aprovadas antes disso ficaram sem o apoio de quem as criou. O contador
 * público fica um abaixo e o criador fica fora do aviso da promessa e do "Foi feito?".
 *
 * Roda em dois passos: `conferirApoioDosOwners` só lista (modo de conferência, não grava nada) e
 * `aplicarApoioDosOwners` chama `registrarApoio`, a mesma regra da aprovação. Idempotente: quem já
 * apoiou não aparece na lista, então rodar de novo não muda nada.
 */
import { sql, type Db } from '@lumens/db';
import { registrarApoio, SEM_APOIO } from './apoio';

export type MotivoDeSobra = 'pauta_sem_apoio' | 'estudante_nao_verificado';

export interface OwnerSemApoio {
  pautaId: string;
  titulo: string;
  estudanteId: string;
  status: string;
  /** `undefined`: o apoio será registrado. Com motivo: `registrarApoio` recusaria, e o owner fica de fora. */
  ignoradoPor?: MotivoDeSobra;
}

export interface Conferencia {
  /** Quem ganha o apoio. */
  aplicaveis: OwnerSemApoio[];
  /** Quem continua sem apoio porque a regra da aprovação também o recusaria. */
  ignorados: OwnerSemApoio[];
}

/**
 * Owners de pauta já aprovada que não têm apoio na própria pauta. O owner é o que estava ativo na
 * aprovação (evento `pauta_aprovada`) ou, sem o evento, o ativo hoje.
 */
export async function conferirApoioDosOwners(db: Db): Promise<Conferencia> {
  const { rows } = await db.execute<{
    pauta_id: string;
    titulo: string;
    status: string;
    estudante_id: string;
    verificado: boolean;
  }>(sql`
    SELECT DISTINCT p.id AS pauta_id, p.titulo, p.status, pa.estudante_id,
           (e.verificado_em IS NOT NULL AND e.saiu_em IS NULL) AS verificado
      FROM pauta p
      JOIN papel_pauta pa ON pa.pauta_id = p.id AND pa.papel = 'owner'
      JOIN estudante e ON e.id = pa.estudante_id
 LEFT JOIN LATERAL (
             SELECT min(criado_em) AS criado_em FROM evento
              WHERE pauta_id = p.id AND tipo = 'pauta_aprovada'
           ) aprovada ON true
     WHERE p.status NOT IN ('em_curadoria', 'recusada')
       AND pa.desde <= coalesce(aprovada.criado_em, now())
       AND (pa.ate IS NULL OR pa.ate > coalesce(aprovada.criado_em, now()))
       AND NOT EXISTS (
             SELECT 1 FROM apoio a WHERE a.pauta_id = p.id AND a.estudante_id = pa.estudante_id
           )
  ORDER BY p.titulo, p.id, pa.estudante_id
  `);

  const conferencia: Conferencia = { aplicaveis: [], ignorados: [] };
  for (const r of rows) {
    const item: OwnerSemApoio = {
      pautaId: r.pauta_id,
      titulo: r.titulo,
      estudanteId: r.estudante_id,
      status: r.status,
    };
    const motivo: MotivoDeSobra | undefined = SEM_APOIO.has(r.status as never)
      ? 'pauta_sem_apoio'
      : r.verificado
        ? undefined
        : 'estudante_nao_verificado';
    if (motivo === undefined) conferencia.aplicaveis.push(item);
    else conferencia.ignorados.push({ ...item, ignoradoPor: motivo });
  }
  return conferencia;
}

/** Registra o apoio de cada owner aplicável, uma transação por pauta e owner. */
export async function aplicarApoioDosOwners(
  db: Db,
  { agora = new Date() }: { agora?: Date } = {},
): Promise<{ registrados: number; recusados: number }> {
  const { aplicaveis } = await conferirApoioDosOwners(db);
  let registrados = 0;
  let recusados = 0;
  for (const { pautaId, estudanteId } of aplicaveis) {
    const r = await db.transaction((tx) =>
      registrarApoio(tx, { pautaId, estudanteId, origem: 'bot', agora }),
    );
    if (r.registrado) registrados += 1;
    else recusados += 1;
  }
  return { registrados, recusados };
}
