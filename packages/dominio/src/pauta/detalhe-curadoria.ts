/** Leitura detalhada usada pela tela individual de curadoria. */
import {
  and,
  apoios,
  eq,
  eventos,
  isNull,
  papeisPauta,
  pautas,
  promessas,
  respostasConferencia,
  relatos,
  estudantes,
  sql,
  type Db,
} from '@lumens/db';
import { buscarPautaDaCuradoria, type PautaDaCuradoria } from './curadoria';
import { caminhosDaPauta as listarCaminhosDaPauta } from '../caminhos/caminhos';

export interface RelatoDaCuradoria {
  texto: string;
  curso: string | null;
  fotoChave: string | null;
  moderacao: 'pendente' | 'aprovado' | 'recusado';
  /** Relatos não guardam data de envio; para o relato inicial usa-se a criação da pauta. */
  data: Date | null;
}

export interface PromessaDaCuradoria {
  resumo: string;
  fonte: string;
  dataEntrega: string;
  conferenciaAbreEm: Date;
  conferenciaFechaEm: Date;
  votos: { sim: number; em_parte: number; nao: number };
}

export interface DetalhePautaDaCuradoria extends PautaDaCuradoria {
  categoria: string;
  apoios: number;
  meta: number;
  metaBatidaEm: Date | null;
  responsaveis: { curso: string | null }[];
  relatos: RelatoDaCuradoria[];
  caminhos: {
    tipo: 'falabr' | 'comunidade' | 'representante';
    protocolo: string | null;
    prazo: string | null;
  }[];
  promessa: PromessaDaCuradoria | null;
}

/** Carrega os dados operacionais da pauta sem trazer nome, telefone ou e-mail de estudante. */
export async function detalharPautaDaCuradoria(
  db: Db,
  pautaId: string,
  agora = new Date(),
): Promise<DetalhePautaDaCuradoria | undefined> {
  const pauta = await buscarPautaDaCuradoria(db, pautaId, agora);
  if (!pauta) return undefined;

  const [
    registro,
    apoiosContados,
    responsaveis,
    relatosDaPauta,
    caminhosDaPauta,
    promessasAtivas,
    metaBatida,
  ] = await Promise.all([
    db
      .select({ categoria: pautas.categoria, meta: pautas.meta, metaBatidaEm: pautas.metaBatidaEm })
      .from(pautas)
      .where(eq(pautas.id, pautaId)),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(apoios)
      .where(eq(apoios.pautaId, pautaId)),
    db
      .select({ curso: estudantes.curso })
      .from(papeisPauta)
      .innerJoin(estudantes, eq(estudantes.id, papeisPauta.estudanteId))
      .where(
        and(eq(papeisPauta.pautaId, pautaId), isNull(papeisPauta.ate), isNull(estudantes.saiuEm)),
      ),
    db
      .select({
        texto: relatos.texto,
        curso: estudantes.curso,
        fotoChave: relatos.fotoChave,
        moderacao: relatos.moderacao,
        moderadoEm: relatos.moderadoEm,
        owner: papeisPauta.papel,
        criadaEm: pautas.criadaEm,
      })
      .from(relatos)
      .innerJoin(estudantes, eq(estudantes.id, relatos.estudanteId))
      .innerJoin(pautas, eq(pautas.id, relatos.pautaId))
      .leftJoin(
        papeisPauta,
        and(
          eq(papeisPauta.pautaId, relatos.pautaId),
          eq(papeisPauta.estudanteId, relatos.estudanteId),
          eq(papeisPauta.papel, 'owner'),
        ),
      )
      .where(eq(relatos.pautaId, pautaId))
      .orderBy(relatos.id),
    listarCaminhosDaPauta(db, pautaId),
    db
      .select({
        resumo: promessas.resumo,
        fonte: promessas.fonte,
        dataEntrega: promessas.dataEntrega,
        conferenciaAbreEm: promessas.conferenciaAbreEm,
        conferenciaFechaEm: promessas.conferenciaFechaEm,
        id: promessas.id,
      })
      .from(promessas)
      .where(eq(promessas.pautaId, pautaId))
      .orderBy(sql`${promessas.conferenciaAbreEm} DESC`)
      .limit(1),
    db
      .select({ criadoEm: eventos.criadoEm })
      .from(eventos)
      .where(and(eq(eventos.pautaId, pautaId), eq(eventos.tipo, 'meta_batida')))
      .orderBy(eventos.criadoEm)
      .limit(1),
  ]);

  const promessa = promessasAtivas[0];
  let votos = { sim: 0, em_parte: 0, nao: 0 };
  if (promessa) {
    const respostas = await db
      .select({ resposta: respostasConferencia.resposta })
      .from(respostasConferencia)
      .where(eq(respostasConferencia.promessaId, promessa.id));
    votos = { sim: 0, em_parte: 0, nao: 0 };
    for (const resposta of respostas) votos[resposta.resposta] += 1;
  }

  return {
    ...pauta,
    categoria: registro[0]?.categoria ?? 'a_classificar',
    meta: registro[0]?.meta ?? 1,
    apoios: apoiosContados[0]?.total ?? 0,
    metaBatidaEm: metaBatida[0]?.criadoEm ?? registro[0]?.metaBatidaEm ?? null,
    responsaveis: responsaveis.map(({ curso }) => ({ curso })),
    relatos: relatosDaPauta.map(
      ({ texto, curso, fotoChave, moderacao, moderadoEm, owner, criadaEm }) => ({
        texto,
        curso,
        fotoChave,
        moderacao,
        data: moderadoEm ?? (owner === 'owner' ? criadaEm : null),
      }),
    ),
    caminhos: caminhosDaPauta.map(({ tipo, protocolo, prazo }) => ({ tipo, protocolo, prazo })),
    promessa: promessa ? { ...promessa, votos } : null,
  };
}
