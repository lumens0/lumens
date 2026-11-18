/**
 * Relato e foto de quem apoia uma pauta que já existe (2.7, RF-B07, RN12).
 *
 * O relato entra sempre como `pendente`: só aparece no site depois que a curadoria aprova
 * (5.3). No site ele não leva quem relatou: as views públicas mostram só o texto, a foto e o
 * curso. A linha guarda o `estudante_id` porque a coluna é obrigatória e porque o `sair` (5.7)
 * precisa achar o que é de quem saiu; o vínculo nunca sai do banco.
 *
 * SCRUM-301: no bot, o relato é gravado assim que o texto chega, e a foto vem depois
 * (`anexarFotoAoRelato`). Assim o relato não se perde se a pessoa não termina o passo da foto.
 */
import {
  and,
  eq,
  estudantes,
  FOTOS_POR_RELATO_MAXIMO,
  pautas,
  relatoFotos,
  relatos,
  sql,
  type StatusPauta,
  type Tx,
} from '@lumens/db';
import { DESCRICAO_MAXIMA } from './pauta';

/** O relato cabe no mesmo limite da descrição da pauta: muitas vezes ele vira uma. */
export const RELATO_MAXIMO = DESCRICAO_MAXIMA;

/** Pauta recusada não recebe nada; as outras recebem relato, inclusive em curadoria. */
const SEM_RELATO: ReadonlySet<StatusPauta> = new Set(['recusada']);

export { FOTOS_POR_RELATO_MAXIMO };

export interface NovoRelatoDoEstudante {
  pautaId: string;
  estudanteId: string;
  texto: string;
  /** Até `FOTOS_POR_RELATO_MAXIMO`; a ordem da lista é a ordem de exibição. */
  fotoChaves?: readonly string[];
}

export type ResultadoRelato =
  | { registrado: true; relatoId: string }
  | {
      registrado: false;
      motivo:
        | 'texto_vazio'
        | 'texto_longo'
        | 'fotos_demais'
        | 'pauta_inexistente'
        | 'pauta_sem_relato'
        | 'estudante_nao_verificado';
    };

const tamanho = (texto: string) => Array.from(texto).length;

/** Grava o relato pendente na transação de quem chama. Recusas voltam como resultado. */
export async function adicionarRelato(
  tx: Tx,
  { pautaId, estudanteId, texto, fotoChaves = [] }: NovoRelatoDoEstudante,
): Promise<ResultadoRelato> {
  const limpo = texto.trim();
  if (limpo === '') return { registrado: false, motivo: 'texto_vazio' };
  if (tamanho(limpo) > RELATO_MAXIMO) return { registrado: false, motivo: 'texto_longo' };
  if (fotoChaves.length > FOTOS_POR_RELATO_MAXIMO) {
    return { registrado: false, motivo: 'fotos_demais' };
  }

  const [pauta] = await tx
    .select({ status: pautas.status })
    .from(pautas)
    .where(eq(pautas.id, pautaId));
  if (pauta === undefined) return { registrado: false, motivo: 'pauta_inexistente' };
  if (SEM_RELATO.has(pauta.status)) return { registrado: false, motivo: 'pauta_sem_relato' };

  // FOR UPDATE serializa com sairDoLumens, como em registrarApoio.
  const [estudante] = await tx
    .select({ verificadoEm: estudantes.verificadoEm, saiuEm: estudantes.saiuEm })
    .from(estudantes)
    .where(eq(estudantes.id, estudanteId))
    .for('update');
  if (estudante?.verificadoEm == null || estudante.saiuEm !== null) {
    return { registrado: false, motivo: 'estudante_nao_verificado' };
  }

  const [inserido] = await tx
    .insert(relatos)
    .values({ pautaId, estudanteId, texto: limpo, moderacao: 'pendente' })
    .returning({ id: relatos.id });
  if (inserido === undefined) throw new Error('relato não inserido');
  if (fotoChaves.length > 0) {
    await tx
      .insert(relatoFotos)
      .values(fotoChaves.map((chave, i) => ({ relatoId: inserido.id, chave, ordem: i + 1 })));
  }
  return { registrado: true, relatoId: inserido.id };
}

export interface FotoDoRelato {
  relatoId: string;
  /** Só quem escreveu o relato junta a foto. */
  estudanteId: string;
  fotoChave: string;
}

export type ResultadoFotoDoRelato =
  | { anexada: true; total: number }
  | { anexada: false; motivo: 'relato_inexistente' | 'ja_moderado' | 'limite_de_fotos' };

/**
 * Junta mais uma foto a um relato já gravado (SCRUM-301), até o limite de três. Só enquanto o
 * relato está `pendente`: a curadoria aprova o relato com o que ele tem, e uma foto que chegasse
 * depois da aprovação iria para o site sem ninguém ver. O relato fica travado (FOR UPDATE) durante
 * a conferência e a inclusão, então duas fotos simultâneas não passam do limite nem repetem a
 * ordem, e a moderação não corre com a foto.
 */
export async function anexarFotoAoRelato(
  tx: Tx,
  { relatoId, estudanteId, fotoChave }: FotoDoRelato,
): Promise<ResultadoFotoDoRelato> {
  const [relato] = await tx
    .select({ moderacao: relatos.moderacao })
    .from(relatos)
    .where(and(eq(relatos.id, relatoId), eq(relatos.estudanteId, estudanteId)))
    .for('update');
  if (relato === undefined) return { anexada: false, motivo: 'relato_inexistente' };
  if (relato.moderacao !== 'pendente') return { anexada: false, motivo: 'ja_moderado' };

  // Conta todas, inclusive as recusadas: a ordem delas não é reaproveitada.
  const [{ total } = { total: 0 }] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(relatoFotos)
    .where(eq(relatoFotos.relatoId, relatoId));
  if (total >= FOTOS_POR_RELATO_MAXIMO) return { anexada: false, motivo: 'limite_de_fotos' };

  await tx.insert(relatoFotos).values({ relatoId, chave: fotoChave, ordem: total + 1 });
  return { anexada: true, total: total + 1 };
}
