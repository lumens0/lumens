/**
 * Moderação de relatos e fotos (5.3, RN12): a fila do que espera decisão e as decisões.
 *
 * O relato nasce `pendente` e só o aprovado chega ao site (`v_relato_publico`). Cada foto (até três
 * por relato) tem a própria moderação: a curadoria recusa uma foto, com motivo, e mantém o texto e
 * as outras. Aprovar o relato aprova as fotos que a tela mostrou; uma foto que chegou depois da
 * tela abrir faz a aprovação voltar (`relato_mudou`), porque nada vai ao ar sem ter sido visto.
 */
import {
  and,
  blocos,
  eq,
  estudantes,
  inArray,
  pautas,
  relatoFotos,
  relatos,
  sql,
  type Db,
  type Tx,
} from '@lumens/db';
import { enfileirarAvisoDeFotoRecusada } from '../avisos/aviso-foto-recusada';
import { conferirAnonimato, type Achado } from '../compartilhado/anonimato';
import { registrarEvento } from '../compartilhado/eventos';
import { MOTIVO_MAXIMO, motivoValido } from '../compartilhado/motivo';

/** Uma foto à espera de decisão: o id é o que a recusa e a conferência (`fotosVistas`) usam. */
export interface FotoParaModerar {
  id: string;
  chave: string;
}

export interface RelatoPendente {
  id: string;
  texto: string;
  /** Só as fotos ainda pendentes, na ordem de envio. */
  fotos: FotoParaModerar[];
  /**
   * Lembrete do que barrar: e-mail, telefone e matrícula (`bloqueio`) e possível nome (`aviso`)
   * achados no texto. É ajuda para quem lê, não filtro: ofensa e o que está na foto só a pessoa vê.
   */
  achados: Achado[];
}

export interface PautaComRelatosPendentes {
  id: string;
  titulo: string;
  /** `null` é pauta do campus inteiro. */
  bloco: string | null;
  relatos: RelatoPendente[];
}

/** As fotos pendentes de cada relato (mapa por id do relato), na ordem de envio. */
export async function fotosPendentesDe(
  db: Db | Tx,
  relatoIds: readonly string[],
): Promise<Map<string, FotoParaModerar[]>> {
  const porRelato = new Map<string, FotoParaModerar[]>();
  if (relatoIds.length === 0) return porRelato;
  const linhas = await db
    .select({ relatoId: relatoFotos.relatoId, id: relatoFotos.id, chave: relatoFotos.chave })
    .from(relatoFotos)
    .where(
      and(inArray(relatoFotos.relatoId, [...relatoIds]), eq(relatoFotos.moderacao, 'pendente')),
    )
    .orderBy(relatoFotos.relatoId, relatoFotos.ordem);
  for (const { relatoId, ...foto } of linhas) {
    porRelato.set(relatoId, [...(porRelato.get(relatoId) ?? []), foto]);
  }
  return porRelato;
}

/** As fotos que a tela mostrou são exatamente as que estão pendentes agora (ordem não importa). */
export function mesmasFotos(vistas: readonly string[] | undefined, atuais: readonly string[]) {
  if (vistas === undefined || vistas.length !== atuais.length) return false;
  const conjunto = new Set(vistas);
  return conjunto.size === atuais.length && atuais.every((id) => conjunto.has(id));
}

/**
 * Relatos pendentes agrupados por pauta, da pauta mais antiga para a mais nova. Pauta recusada
 * fica de fora, assim como as pautas ainda em curadoria, cujo relato de origem é decidido junto
 * com a pauta.
 */
export async function listarRelatosPendentes(db: Db): Promise<PautaComRelatosPendentes[]> {
  const linhas = await db
    .select({
      pautaId: pautas.id,
      titulo: pautas.titulo,
      bloco: blocos.nome,
      id: relatos.id,
      texto: relatos.texto,
    })
    .from(relatos)
    .innerJoin(pautas, eq(pautas.id, relatos.pautaId))
    .leftJoin(blocos, eq(blocos.id, pautas.blocoId))
    .where(
      and(
        eq(relatos.moderacao, 'pendente'),
        sql`${pautas.status} not in ('em_curadoria', 'recusada')`,
      ),
    )
    // `relato` não guarda data: dentro da pauta a ordem é pelo id, só para não mudar entre leituras.
    .orderBy(pautas.criadaEm, pautas.id, relatos.id);

  const fotos = await fotosPendentesDe(
    db,
    linhas.map((l) => l.id),
  );
  const fila: PautaComRelatosPendentes[] = [];
  for (const { pautaId, titulo, bloco, ...relato } of linhas) {
    let grupo = fila.at(-1);
    if (grupo?.id !== pautaId) {
      grupo = { id: pautaId, titulo, bloco, relatos: [] };
      fila.push(grupo);
    }
    grupo.relatos.push({
      ...relato,
      fotos: fotos.get(relato.id) ?? [],
      achados: conferirAnonimato(relato.texto).achados,
    });
  }
  return fila;
}

export type ResultadoModeracao =
  | { moderado: true }
  | { moderado: false; motivo: 'relato_inexistente' | 'ja_moderado' | 'relato_mudou' };

export interface DecisaoDeModeracao {
  relatoId: string;
  /** Quem decidiu: fica em `relato.moderado_por`. */
  curadorId: string;
  agora?: Date;
}

/** Aprovar vale para o que a curadoria viu: os ids das fotos pendentes da tela (vazio, se sem foto). */
export interface AprovacaoDeRelato extends DecisaoDeModeracao {
  fotosVistas: readonly string[];
}

/** Motivo gravado nas fotos que ainda estavam pendentes quando o relato inteiro foi recusado. */
export const MOTIVO_FOTO_DO_RELATO_RECUSADO = 'Recusada junto com o relato.';

async function moderar(
  tx: Tx,
  { relatoId, curadorId, agora = new Date() }: DecisaoDeModeracao,
  para: 'aprovado' | 'recusado',
  fotosVistas?: readonly string[],
): Promise<ResultadoModeracao> {
  // FOR UPDATE: duas pessoas da curadoria clicando ao mesmo tempo; a segunda vê o relato já moderado.
  const [relato] = await tx
    .select({ pautaId: relatos.pautaId, moderacao: relatos.moderacao })
    .from(relatos)
    .where(eq(relatos.id, relatoId))
    .for('update');

  if (relato === undefined) return { moderado: false, motivo: 'relato_inexistente' };
  if (relato.moderacao !== 'pendente') return { moderado: false, motivo: 'ja_moderado' };
  // Fotos podem ser juntadas depois de a fila abrir (SCRUM-301): aprovar o que ninguém viu
  // publicaria uma imagem sem revisão. Mudou (chegou foto, ou uma foi recusada), a curadoria vê de novo.
  const pendentes = (await fotosPendentesDe(tx, [relatoId])).get(relatoId) ?? [];
  if (
    fotosVistas !== undefined &&
    !mesmasFotos(
      fotosVistas,
      pendentes.map((f) => f.id),
    )
  ) {
    return { moderado: false, motivo: 'relato_mudou' };
  }

  await tx
    .update(relatos)
    .set({ moderacao: para, moderadoEm: agora, moderadoPor: curadorId })
    .where(eq(relatos.id, relatoId));
  if (pendentes.length > 0) {
    await tx
      .update(relatoFotos)
      .set(
        para === 'aprovado'
          ? { moderacao: 'aprovado', moderadoEm: agora, moderadoPor: curadorId }
          : {
              moderacao: 'recusado',
              motivoRecusa: MOTIVO_FOTO_DO_RELATO_RECUSADO,
              moderadoEm: agora,
              moderadoPor: curadorId,
            },
      )
      .where(
        inArray(
          relatoFotos.id,
          pendentes.map((f) => f.id),
        ),
      );
  }
  // O catálogo só tem evento para a aprovação; a recusa fica no próprio relato, fora do site.
  if (para === 'aprovado') {
    await registrarEvento(tx, {
      pautaId: relato.pautaId,
      tipo: 'relato_aprovado',
      dados: { relato_id: relatoId },
      origem: 'curadoria',
    });
  }
  return { moderado: true };
}

/** Aprova: o relato (com as fotos vistas) passa a aparecer no site, se a pauta dele for pública. */
export function aprovarRelato(tx: Tx, decisao: AprovacaoDeRelato): Promise<ResultadoModeracao> {
  return moderar(tx, decisao, 'aprovado', decisao.fotosVistas);
}

/** Recusa: o relato nunca vai ao site. Não há aviso a quem relatou nem evento na linha do tempo. */
export function recusarRelato(tx: Tx, decisao: DecisaoDeModeracao): Promise<ResultadoModeracao> {
  return moderar(tx, decisao, 'recusado');
}

/** Teto do motivo: cabe numa mensagem do bot e no parâmetro do modelo. */
export const MOTIVO_DE_FOTO_MAXIMO = MOTIVO_MAXIMO;

export type ResultadoRecusaDeFoto =
  | { recusada: true }
  | {
      recusada: false;
      motivo: 'foto_inexistente' | 'ja_recusada' | 'relato_recusado' | 'motivo_invalido';
    };

/**
 * Recusa uma foto, com motivo obrigatório, e mantém o texto e as outras fotos. Vale enquanto o relato
 * está pendente ou aprovado (uma foto já no ar também pode ser tirada). A pessoa que enviou recebe o
 * motivo pelo bot (`foto_recusada`, na mesma transação: sem recusa gravada, sem aviso).
 */
export async function recusarFoto(
  tx: Tx,
  {
    fotoId,
    curadorId,
    motivo,
    agora = new Date(),
  }: { fotoId: string; curadorId: string; motivo: string; agora?: Date },
): Promise<ResultadoRecusaDeFoto> {
  const limpo = motivoValido(motivo);
  if (limpo === undefined) return { recusada: false, motivo: 'motivo_invalido' };
  const [achada] = await tx
    .select({ relatoId: relatoFotos.relatoId, estudanteId: relatos.estudanteId })
    .from(relatoFotos)
    .innerJoin(relatos, eq(relatos.id, relatoFotos.relatoId))
    .where(eq(relatoFotos.id, fotoId));
  if (achada === undefined) return { recusada: false, motivo: 'foto_inexistente' };

  // Estudante antes do relato, na ordem de `sairDoLumens` (que trava o estudante e depois os relatos):
  // o aviso abaixo insere em `disparo`, que pede KEY SHARE no estudante, e sem esta ordem recusar a
  // foto e a saída de quem a enviou esperariam uma pela outra. Se a pessoa saiu, o relato já foi
  // apagado e a foto some abaixo; um aviso não é enfileirado para quem saiu.
  await tx
    .select({ id: estudantes.id })
    .from(estudantes)
    .where(eq(estudantes.id, achada.estudanteId))
    .for('share');

  // Relato antes da foto, na ordem de `moderar` e de `anexarFotoAoRelato`.
  const [relato] = await tx
    .select({ moderacao: relatos.moderacao })
    .from(relatos)
    .where(eq(relatos.id, achada.relatoId))
    .for('update');
  if (relato === undefined) return { recusada: false, motivo: 'foto_inexistente' };
  if (relato.moderacao === 'recusado') return { recusada: false, motivo: 'relato_recusado' };

  const [recusada] = await tx
    .update(relatoFotos)
    .set({ moderacao: 'recusado', motivoRecusa: limpo, moderadoEm: agora, moderadoPor: curadorId })
    .where(and(eq(relatoFotos.id, fotoId), sql`${relatoFotos.moderacao} <> 'recusado'`))
    .returning({ id: relatoFotos.id });
  if (recusada === undefined) return { recusada: false, motivo: 'ja_recusada' };
  await enfileirarAvisoDeFotoRecusada(tx, {
    fotoId,
    relatoId: achada.relatoId,
    motivo: limpo,
    agora,
  });
  return { recusada: true };
}
