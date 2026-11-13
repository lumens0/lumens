/**
 * História 2.8 · Comandos do site (RF-B09).
 *
 * Os botões do site abrem o bot com o texto pronto (`wa.me/...?text=`, ou o `start` do Telegram):
 *
 *   "apoiar <slug>"  ──▶ apoio da 2.7 (verifica antes, se preciso, e retoma)
 *   "ajudar <slug>"  ──▶ "Vou ajudar" da proposta (3.5)
 *   "nova pauta"     ──▶ pauta nova da 2.6 (verifica antes, se preciso, e retoma)
 *   "cuidar <pauta>" ──▶ virar co-owner (convite do fim do apoio)
 *
 * Valem em qualquer passo, como os comandos globais, e largam o fluxo em andamento: quem clicou
 * no site quer fazer aquilo agora. A exceção é o alvo que não existe no meio de um fluxo: "apoiar
 * estudantes" pode ser só a resposta (o título de uma pauta nova, por exemplo), então a mensagem
 * segue para o passo atual. No menu ou no primeiro contato, o alvo que não existe vira um aviso.
 */
import { eq, pautas, type Db } from '@lumens/db';
import { SEM_APOIO } from '@lumens/dominio';
import { SUPPORT_CLOSED_TEXT, entrarNoApoio } from './apoio';
import { cuidarDaPauta } from './co-owner';
import type { StepContext, StepResult } from './handlers';
import { entrarNaPautaNova } from './nova-pauta';
import { UUID, vouAjudar } from './proposta';
import type { Step } from './steps';
import { normalize } from './texto';

export const PAUTA_NOT_FOUND_TEXT =
  'Não encontrei essa pauta. Ela pode ter mudado de endereço: abra a página dela no site e toque no botão de novo.';

export type ComandoDoSite =
  { kind: 'apoiar' | 'ajudar' | 'cuidar'; alvo: string } | { kind: 'nova-pauta' };

const COM_ALVO = /^(apoiar|ajudar|cuidar)\s+(\S+)$/i;

/** O comando que veio do site (ou digitado igual); `null` se a mensagem não é um deles. */
export function parseComandoDoSite(texto: string): ComandoDoSite | null {
  const m = COM_ALVO.exec(texto.trim());
  if (m?.[1] !== undefined && m[2] !== undefined) {
    return { kind: m[1].toLowerCase() as 'apoiar' | 'ajudar' | 'cuidar', alvo: m[2] };
  }
  return normalize(texto) === 'nova pauta' ? { kind: 'nova-pauta' } : null;
}

/** Pauta pelo slug do site ou pelo id (botões do próprio bot). */
async function pautaDoAlvo(db: Db, alvo: string) {
  const [pauta] = await db
    .select({ id: pautas.id, status: pautas.status })
    .from(pautas)
    .where(UUID.test(alvo) ? eq(pautas.id, alvo) : eq(pautas.slug, alvo.toLowerCase()));
  return pauta;
}

/** Passos em que nenhuma resposta está em aberto: lá, o alvo que não existe vira aviso. */
const SEM_PERGUNTA_ABERTA: readonly Step[] = ['GREETING', 'MENU'];

/**
 * Executa o comando. `null` quando a mensagem deve seguir para o passo atual (alvo que não existe
 * no meio de um fluxo). O fluxo largado não deixa dados: o `state` passado aos fluxos vem vazio.
 */
export async function executarComandoDoSite(
  ctx: StepContext,
  comando: ComandoDoSite,
): Promise<StepResult | null> {
  const limpo: StepContext = { ...ctx, state: { step: ctx.state.step, data: {} } };
  if (comando.kind === 'nova-pauta') return entrarNaPautaNova(limpo);
  if (comando.kind === 'ajudar') return vouAjudar(limpo, comando.alvo);

  const pauta = await pautaDoAlvo(ctx.db, comando.alvo);
  if (pauta === undefined) {
    return SEM_PERGUNTA_ABERTA.includes(ctx.state.step)
      ? { next: 'MENU', replies: [PAUTA_NOT_FOUND_TEXT] }
      : null;
  }
  if (comando.kind === 'cuidar') return cuidarDaPauta(limpo, pauta.id);
  // Fechada para apoio: avisa já, sem mandar a pessoa verificar o e-mail para nada.
  if (SEM_APOIO.has(pauta.status)) return { next: 'MENU', replies: [SUPPORT_CLOSED_TEXT] };
  return entrarNoApoio(limpo, pauta.id);
}
