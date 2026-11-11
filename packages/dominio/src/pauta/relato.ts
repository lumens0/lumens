/**
 * Relato e foto de quem apoia uma pauta que já existe (2.7, RF-B07, RN12).
 *
 * O relato entra sempre como `pendente`: só aparece no site depois que a curadoria aprova
 * (5.3). No site ele não leva quem relatou: as views públicas mostram só o texto, a foto e o
 * curso. A linha guarda o `estudante_id` porque a coluna é obrigatória e porque o `sair` (5.7)
 * precisa achar o que é de quem saiu; o vínculo nunca sai do banco.
 */
import { eq, estudantes, pautas, relatos, type StatusPauta, type Tx } from '@lumens/db';
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
