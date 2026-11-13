/**
 * História 3.5 · Proposta da comunidade e "Vou ajudar" (RF-B14, RF-B16, RN09).
 *
 *   OWNER_PATHS (comunidade aberta) ──[Propor solução]──▶ PROPOSAL_ASK_TEXT ──▶ PROPOSAL_ASK_PEOPLE
 *                                   ──[Proposta feita]──▶ conquista parcial      └─▶ publica e volta
 *
 *   "ajudar <slug>" (botão "Vou ajudar" do site), em qualquer passo ──▶ entra na lista de voluntários
 *
 * O bot deixa uma proposta aberta por vez em cada pauta: o botão do owner é "Propor solução" sem
 * nenhuma aberta e "Proposta feita" com uma.
 */
import { eq, pautas, propostas, type Db } from '@lumens/db';
import { propostasAbertas, registrarVoluntario } from '@lumens/dominio';
import { z } from 'zod';
import { estudanteVerificado } from './estudante';
import type { DataPatch, StepContext, StepHandler, StepResult } from './handlers';
import { botoes, lista, type Resposta } from './resposta';
import { normalize } from './texto';
import { EMAIL_QUESTION_TEXT } from './verificacao';

export const PROPOSAL_ASK_TEXT =
  'Descreva em poucas linhas o que a própria comunidade pode fazer (ex.: um mutirão para pintar as faixas). Vai aparecer no site.';
export const PROPOSAL_EMPTY_TEXT = 'Escreva a proposta em texto, com até 280 caracteres.';
export const PEOPLE_ASK_TEXT = 'Quantas pessoas são necessárias? Responda com um número de 1 a 50.';
export const PEOPLE_INVALID_TEXT = 'Responda só com um número de 1 a 50.';
export const PUBLISHED_TEXT =
  'Proposta publicada ✅ Ela aparece na página da pauta com o botão "Vou ajudar".';
export const DONE_TEXT =
  'Proposta marcada como feita ✅ Ela entra na linha do tempo como conquista parcial, e a pauta continua sendo cobrada.';
export const NEED_VERIFY_TEXT =
  'Para entrar na lista de voluntários, primeiro preciso verificar que você é estudante da UFAL.';
export const NO_PROPOSAL_TEXT = 'Esta pauta não tem proposta aberta agora.';
export const PROPOSAL_CLOSED_TEXT = 'Esta proposta já foi feita ou não aceita mais voluntários.';
export const ALREADY_DONE_TEXT = 'Esta proposta já estava marcada como feita.';
export const ALREADY_VOLUNTEER_TEXT = 'Você já está na lista de voluntários desta proposta.';
export const PROPOSAL_LOST_TEXT =
  'Não consegui recuperar a pauta da proposta. Escolha 4 no menu de novo.';
export const PICK_PROPOSAL_TEXT = 'Esta pauta tem mais de uma proposta aberta. Em qual vai ajudar?';

/**
 * Confirmação do "Vou ajudar" que veio pelo slug: entre abrir o link e mandar a mensagem, a
 * proposta que a pessoa viu pode ter sido feita e outra publicada. O botão leva o id da proposta
 * mostrada aqui, então só entra na lista quem confirmou aquela.
 */
export function confirmVolunteerText(p: {
  descricao: string;
  pessoasNecessarias: number;
  voluntarios: number;
}) {
  return `Você quer entrar na lista de voluntários desta proposta?\n\n"${p.descricao}"\n${String(p.voluntarios)} de ${String(p.pessoasNecessarias)} voluntários`;
}

const MAX_TEXTO = 280;
export const MAX_PESSOAS = 50;

export const BOTAO_PROPOR = 'proposta:nova';
/** Prefixo do botão "Proposta feita"; o id da proposta vem depois, para o toque valer só para ela. */
export const BOTAO_FEITA = 'proposta:feita';
export const botaoFeita = (propostaId: string) => `${BOTAO_FEITA}:${propostaId}`;

export function volunteerText(p: {
  descricao: string;
  pessoasNecessarias: number;
  voluntarios: number;
}) {
  return `Anotado ✅ Você está na lista de voluntários de: "${p.descricao}". Agora são ${String(p.voluntarios)} de ${String(p.pessoasNecessarias)} pessoas. Seu nome não aparece no site, só a contagem.`;
}

/** `ajudar <slug ou id>`, digitado ou vindo do link do site; `null` se não é esse comando. */
export function parseAjudar(texto: string): string | null {
  const m = /^ajudar\s+(\S+)$/i.exec(texto.trim());
  return m?.[1] ?? null;
}

/** O pedido "Propor solução" (botão ou digitado). */
export function pediuProposta(texto: string): boolean {
  const t = normalize(texto);
  return texto.trim() === BOTAO_PROPOR || t === 'propor' || t === 'propor solucao';
}

/** O pedido "Proposta feita" (botão ou digitado). */
export function pediuFeita(texto: string): boolean {
  const t = normalize(texto);
  return texto.trim().startsWith(BOTAO_FEITA) || t === 'feita' || t === 'proposta feita';
}

/** Id da proposta no botão "Proposta feita"; `undefined` quando foi digitado (vale a aberta). */
export function propostaDoBotaoFeita(texto: string): string | undefined {
  const m = /^proposta:feita:(\S+)$/.exec(texto.trim());
  return m?.[1];
}

export const dadosDaProposta = z.object({
  pautaId: z.uuid(),
  propostaCifrada: z.string().optional(),
});
export const LIMPAR_PROPOSTA: DataPatch = { pautaId: undefined, propostaCifrada: undefined };

export const proposalAskText: StepHandler = ({ input, state, segredo }) => {
  const texto = input.text.trim();
  if (texto === '' || Array.from(texto).length > MAX_TEXTO) {
    return { next: 'PROPOSAL_ASK_TEXT', replies: [PROPOSAL_EMPTY_TEXT] };
  }
  if (!dadosDaProposta.safeParse(state.data).success) {
    return { next: 'MENU', data: LIMPAR_PROPOSTA, replies: [PROPOSAL_LOST_TEXT] };
  }
  return {
    next: 'PROPOSAL_ASK_PEOPLE',
    data: { propostaCifrada: segredo.cifrar(texto) },
    replies: [PEOPLE_ASK_TEXT],
  };
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Acha a proposta: pelo id (botão de confirmação ou linha da lista) ou pela pauta do link do site.
 * Pelo link, nunca registra direto: pede para confirmar ou escolher, sempre com o id no botão.
 */
async function propostaDoAlvo(
  db: Db,
  alvo: string,
): Promise<{ id: string } | { escolher: Resposta } | { texto: string }> {
  if (UUID.test(alvo)) {
    const [p] = await db.select({ id: propostas.id }).from(propostas).where(eq(propostas.id, alvo));
    return p ?? { texto: NO_PROPOSAL_TEXT };
  }
  const [pauta] = await db
    .select({ id: pautas.id })
    .from(pautas)
    .where(eq(pautas.slug, alvo.toLowerCase()));
  const abertas = pauta === undefined ? [] : await propostasAbertas(db, pauta.id);
  const [unica] = abertas;
  if (unica === undefined) return { texto: NO_PROPOSAL_TEXT };
  if (abertas.length === 1) {
    return {
      escolher: botoes({
        corpo: confirmVolunteerText(unica),
        botoes: [
          { id: `ajudar ${unica.id}`, titulo: 'Vou ajudar' },
          { id: 'menu', titulo: 'Voltar ao menu' },
        ],
      }),
    };
  }
  return {
    escolher: lista({
      corpo: PICK_PROPOSAL_TEXT,
      botao: 'Ver propostas',
      linhas: abertas.slice(0, 10).map((p) => ({
        id: `ajudar ${p.id}`,
        titulo: p.descricao,
        descricao: `${String(p.voluntarios)} de ${String(p.pessoasNecessarias)} voluntários`,
      })),
    }),
  };
}

/**
 * "Vou ajudar": sem verificação, guarda o pedido e verifica antes (2.4 retoma daqui). Sem proposta
 * aberta, avisa já (2.8), sem mandar a pessoa verificar o e-mail para nada.
 */
export async function vouAjudar(
  { db, phoneHmac }: Pick<StepContext, 'db' | 'phoneHmac'>,
  alvo: string,
  antes: Resposta[] = [],
): Promise<StepResult> {
  const estudanteId = await estudanteVerificado(db, phoneHmac);
  if (estudanteId === undefined) {
    const achada = await propostaDoAlvo(db, alvo);
    if ('texto' in achada) return { next: 'MENU', replies: [...antes, achada.texto] };
    return {
      next: 'VERIFY_ASK_EMAIL',
      data: { pendingCommand: { kind: 'ajudar', id: alvo } },
      replies: [NEED_VERIFY_TEXT, EMAIL_QUESTION_TEXT],
    };
  }
  const achada = await propostaDoAlvo(db, alvo);
  if ('texto' in achada) return { next: 'MENU', replies: [...antes, achada.texto] };
  if ('escolher' in achada) return { next: 'MENU', replies: [...antes, achada.escolher] };

  const r = await db.transaction((tx) =>
    registrarVoluntario(tx, { propostaId: achada.id, estudanteId }),
  );
  if (!r.registrado) {
    const texto = r.motivo === 'proposta_inexistente' ? NO_PROPOSAL_TEXT : PROPOSAL_CLOSED_TEXT;
    return { next: 'MENU', replies: [...antes, texto] };
  }
  const texto = r.jaEstava ? ALREADY_VOLUNTEER_TEXT : volunteerText(r.proposta);
  return { next: 'MENU', replies: [...antes, texto] };
}
