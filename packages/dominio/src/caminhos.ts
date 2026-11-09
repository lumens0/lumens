/**
 * Caminhos de cobrança (RN07): Fala.BR e comunidade são independentes, um nunca bloqueia o outro,
 * e podem ser abertos em qualquer ordem, inclusive antes da meta (RN05).
 *
 * Abrir caminho não muda o status da pauta: ela vai para `cobrando` quando o protocolo do Fala.BR
 * é registrado (RN08, `registrarProtocolo`). Uma pauta pode ter mais de um caminho do mesmo tipo
 * (duas manifestações no Fala.BR, para órgãos diferentes, por exemplo).
 */
import {
  and,
  caminhos,
  eq,
  inArray,
  isNull,
  papeisPauta,
  pautas,
  sql,
  type Db,
  type StatusPauta,
  type Tx,
} from '@lumens/db';
import { registrarEvento } from './eventos';

/**
 * Pautas em que o owner pode abrir caminho (3.3): as aprovadas pela curadoria que ainda não
 * terminaram. Em curadoria e recusada não são públicas; conquistada já acabou.
 */
export const STATUS_COM_CAMINHOS: readonly StatusPauta[] = [
  'juntando_apoios',
  'meta_batida',
  'cobrando',
  'prometido',
  'entregue_em_parte',
  'descumprida',
];

export interface NovoCaminho {
  pautaId: string;
  tipo: 'falabr' | 'comunidade';
  /** Quem pediu. Só owner ativo da pauta abre caminho. */
  porEstudanteId: string;
  agora?: Date;
}

export type ResultadoCaminho =
  | { aberto: true; caminhoId: string }
  | { aberto: false; motivo: 'nao_e_owner' | 'pauta_fechada' };

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

  // Pauta em curadoria ou recusada não é pública, e a conquistada já acabou: não abre caminho.
  const [pauta] = await tx
    .select({ status: pautas.status })
    .from(pautas)
    .where(eq(pautas.id, pautaId));
  if (pauta === undefined || !STATUS_COM_CAMINHOS.includes(pauta.status)) {
    return { aberto: false, motivo: 'pauta_fechada' };
  }

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

export interface CaminhoDaPauta {
  id: string;
  tipo: 'falabr' | 'comunidade' | 'representante';
  status: string;
  protocolo: string | null;
  /** `AAAA-MM-DD`, quando já há protocolo. */
  prazo: string | null;
  abertoEm: Date;
}

/** Os caminhos de uma pauta, do mais antigo para o mais novo (3.3: estado dos caminhos). */
export async function caminhosDaPauta(db: Db, pautaId: string): Promise<CaminhoDaPauta[]> {
  return db
    .select({
      id: caminhos.id,
      tipo: caminhos.tipo,
      status: caminhos.status,
      protocolo: caminhos.protocolo,
      prazo: caminhos.prazo,
      abertoEm: caminhos.abertoEm,
    })
    .from(caminhos)
    .where(eq(caminhos.pautaId, pautaId))
    .orderBy(caminhos.abertoEm);
}

export interface PautaDoOwner {
  id: string;
  slug: string;
  titulo: string;
  status: StatusPauta;
}

/**
 * Pautas em que o estudante é owner ou co-owner ativo e ainda pode abrir caminho, da mais nova
 * para a mais antiga.
 */
export async function pautasDoOwner(db: Db, estudanteId: string): Promise<PautaDoOwner[]> {
  return db
    .select({ id: pautas.id, slug: pautas.slug, titulo: pautas.titulo, status: pautas.status })
    .from(papeisPauta)
    .innerJoin(pautas, eq(pautas.id, papeisPauta.pautaId))
    .where(
      and(
        eq(papeisPauta.estudanteId, estudanteId),
        isNull(papeisPauta.ate),
        inArray(pautas.status, [...STATUS_COM_CAMINHOS]),
      ),
    )
    .orderBy(sql`${pautas.criadaEm} DESC`);
}
