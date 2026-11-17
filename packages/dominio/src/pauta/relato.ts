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
  isNull,
  pautas,
  relatos,
  type StatusPauta,
  type Tx,
} from '@lumens/db';
import { DESCRICAO_MAXIMA } from './pauta';

/** O relato cabe no mesmo limite da descrição da pauta: muitas vezes ele vira uma. */
export const RELATO_MAXIMO = DESCRICAO_MAXIMA;

/** Pauta recusada não recebe nada; as outras recebem relato, inclusive em curadoria. */
const SEM_RELATO: ReadonlySet<StatusPauta> = new Set(['recusada']);

export interface NovoRelatoDoEstudante {
  pautaId: string;
  estudanteId: string;
  texto: string;
  fotoChave?: string | null;
}

export type ResultadoRelato =
  | { registrado: true; relatoId: string }
  | {
      registrado: false;
      motivo:
        | 'texto_vazio'
        | 'texto_longo'
        | 'pauta_inexistente'
        | 'pauta_sem_relato'
        | 'estudante_nao_verificado';
    };

const tamanho = (texto: string) => Array.from(texto).length;

/** Grava o relato pendente na transação de quem chama. Recusas voltam como resultado. */
export async function adicionarRelato(
  tx: Tx,
  { pautaId, estudanteId, texto, fotoChave = null }: NovoRelatoDoEstudante,
): Promise<ResultadoRelato> {
  const limpo = texto.trim();
  if (limpo === '') return { registrado: false, motivo: 'texto_vazio' };
  if (tamanho(limpo) > RELATO_MAXIMO) return { registrado: false, motivo: 'texto_longo' };

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
    .values({ pautaId, estudanteId, texto: limpo, fotoChave, moderacao: 'pendente' })
    .returning({ id: relatos.id });
  if (inserido === undefined) throw new Error('relato não inserido');
  return { registrado: true, relatoId: inserido.id };
}

export interface FotoDoRelato {
  relatoId: string;
  /** Só quem escreveu o relato junta a foto. */
  estudanteId: string;
  fotoChave: string;
}

export type ResultadoFotoDoRelato =
  | { anexada: true }
  | { anexada: false; motivo: 'relato_inexistente' | 'ja_moderado' | 'ja_tem_foto' };

/**
 * Junta a foto a um relato já gravado (SCRUM-301). Só enquanto o relato está `pendente`: a
 * curadoria aprova o relato com o que ele tem, e uma foto que chegasse depois da aprovação iria
 * para o site sem ninguém ver. A condição vai no próprio UPDATE, então não corre com a moderação.
 */
export async function anexarFotoAoRelato(
  tx: Tx,
  { relatoId, estudanteId, fotoChave }: FotoDoRelato,
): Promise<ResultadoFotoDoRelato> {
  const doEstudante = and(eq(relatos.id, relatoId), eq(relatos.estudanteId, estudanteId));
  const [anexada] = await tx
    .update(relatos)
    .set({ fotoChave })
    .where(and(doEstudante, eq(relatos.moderacao, 'pendente'), isNull(relatos.fotoChave)))
    .returning({ id: relatos.id });
  if (anexada !== undefined) return { anexada: true };

  const [atual] = await tx
    .select({ moderacao: relatos.moderacao })
    .from(relatos)
    .where(doEstudante);
  if (atual === undefined) return { anexada: false, motivo: 'relato_inexistente' };
  if (atual.moderacao !== 'pendente') return { anexada: false, motivo: 'ja_moderado' };
  return { anexada: false, motivo: 'ja_tem_foto' };
}
