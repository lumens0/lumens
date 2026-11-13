/**
 * História 2.8 · Virar co-owner (RF-B10, RN06).
 *
 *   fim do apoio (2.7), com vaga ──▶ convite "Quero cuidar" ──▶ "cuidar <pauta>"
 *   "cuidar <pauta>" digitado, em qualquer passo ─────────────────────┘
 *        │
 *        ├─ não verificado ──▶ VERIFY_ASK_EMAIL, guardando o pedido (2.4 retoma daqui)
 *        └─ verificado ──▶ adicionarCoOwner: limite de 3 owners ativos no serviço de regras
 *
 * O convite só aparece para quem apoia, ainda não cuida da pauta e encontra vaga. Quem decide de
 * verdade é `adicionarCoOwner`, com a trava na pauta: o convite pode ter ficado velho.
 */
import { eq, pautas, type Db } from '@lumens/db';
import { SEM_APOIO, adicionarCoOwner, podeVirarCoOwner } from '@lumens/dominio';
import { estudanteVerificado } from './estudante';
import type { StepContext, StepResult } from './handlers';
import { botoes, type Resposta } from './resposta';

export const COOWNER_VERIFY_FIRST_TEXT =
  'Para cuidar de uma pauta, você precisa ser estudante verificado. Vamos verificar o seu e-mail institucional: qual é ele?';
export const COOWNER_INVITE_TEXT =
  'Quer ajudar a cuidar desta pauta? Até 3 pessoas cuidam de cada uma: recebem os avisos e escolhem os próximos passos pelo bot, em "Minhas pautas".';
export const COOWNER_NOT_FOUND_TEXT = 'Não encontrei essa pauta. Confira o link no site.';
export const COOWNER_CLOSED_TEXT = 'Esta pauta não está recebendo novas pessoas para cuidar dela.';

export const BOTAO_CUIDAR = 'cuidar';
export const botaoCuidar = (pautaId: string) => `${BOTAO_CUIDAR} ${pautaId}`;

export function coOwnerText(titulo: string): string {
  return `Pronto ✅ Agora você cuida da pauta *${titulo}*. Escolha 4 no menu (Minhas pautas) para ver os próximos passos.`;
}

export function alreadyOwnerText(titulo: string): string {
  return `Você já cuida da pauta *${titulo}*. Escolha 4 no menu (Minhas pautas) para ver os próximos passos.`;
}

export function ownersFullText(titulo: string): string {
  return `A pauta *${titulo}* já tem 3 pessoas cuidando dela, que é o limite. O seu apoio continua contado.`;
}

export function supportFirstText(titulo: string): string {
  return `Para cuidar da pauta *${titulo}*, primeiro você precisa apoiá-la.`;
}

/** Convite ao fim do apoio, só quando há vaga para esta pessoa. */
export async function conviteCoOwner(
  db: Db,
  { pautaId, estudanteId }: { pautaId: string; estudanteId: string },
): Promise<Resposta | undefined> {
  if (!(await podeVirarCoOwner(db, { pautaId, estudanteId }))) return undefined;
  return botoes({
    corpo: COOWNER_INVITE_TEXT,
    botoes: [{ id: botaoCuidar(pautaId), titulo: 'Quero cuidar' }],
  });
}

/** "cuidar <pauta>": a pauta já foi achada por quem chama (pelo slug do site ou pelo id). */
export async function cuidarDaPauta(
  { db, phoneHmac }: Pick<StepContext, 'db' | 'phoneHmac'>,
  pautaId: string,
  antes: Resposta[] = [],
): Promise<StepResult> {
  const [pauta] = await db
    .select({ titulo: pautas.titulo, status: pautas.status })
    .from(pautas)
    .where(eq(pautas.id, pautaId));
  if (pauta === undefined) return { next: 'MENU', replies: [...antes, COOWNER_NOT_FOUND_TEXT] };
  if (SEM_APOIO.has(pauta.status)) {
    return { next: 'MENU', replies: [...antes, COOWNER_CLOSED_TEXT] };
  }

  const estudanteId = await estudanteVerificado(db, phoneHmac);
  if (estudanteId === undefined) {
    return {
      next: 'VERIFY_ASK_EMAIL',
      data: { pendingCommand: { kind: 'cuidar', id: pautaId } },
      replies: [...antes, COOWNER_VERIFY_FIRST_TEXT],
    };
  }

  // Transação aninhada (savepoint): o papel e o `owner_entrou` confirmam juntos.
  const r = await db.transaction((tx) => adicionarCoOwner(tx, { pautaId, estudanteId }));
  if (r.adicionado) return { next: 'MENU', replies: [...antes, coOwnerText(pauta.titulo)] };
  switch (r.motivo) {
    case 'ja_e_owner':
      return { next: 'MENU', replies: [...antes, alreadyOwnerText(pauta.titulo)] };
    case 'limite_de_owners':
      return { next: 'MENU', replies: [...antes, ownersFullText(pauta.titulo)] };
    case 'pauta_inexistente':
      return { next: 'MENU', replies: [...antes, COOWNER_NOT_FOUND_TEXT] };
    case 'pauta_fechada':
      // A pauta fechou entre a leitura acima e a trava de `adicionarCoOwner`.
      return { next: 'MENU', replies: [...antes, COOWNER_CLOSED_TEXT] };
    case 'nao_apoiou':
      return {
        next: 'MENU',
        replies: [
          ...antes,
          botoes({
            corpo: supportFirstText(pauta.titulo),
            botoes: [{ id: `apoiar ${pautaId}`, titulo: 'Apoiar' }],
          }),
        ],
      };
  }
}
