/**
 * História 2.6 · Criar pauta nova pela conversa (RF-B03, RN06).
 *
 *   "2 Nova pauta" ──┐
 *   2.5 "É outro" ───┴─▶ estudante verificado? ──não──▶ VERIFY_ASK_EMAIL (2.4), guardando o pedido
 *                              │ sim
 *                              ▼
 *   NEW_ASK_TITLE ──▶ NEW_ASK_PLACE ──▶ NEW_ASK_DESCRIPTION ──▶ NEW_ASK_PHOTO ──▶ criarPauta + resumo
 *        │  (lista de blocos)                                       ▲
 *        └── veio da 2.5: o bloco e o relato já estão nos dados ────┘
 *
 * Tudo o que a pessoa escreve fica cifrado nos dados da conversa, como o relato da 2.5: a tabela
 * `conversa` guarda o passo de cada telefone por 24h. A pauta só é gravada no último passo, por
 * `criarPauta` (domínio), na mesma transação da conversa.
 */
import { blocos, eq, estudantes, type Db } from '@lumens/db';
import {
  DESCRICAO_MAXIMA,
  TITULO_MAXIMO,
  criarPauta,
  listarBlocos,
  type ResultadoCriacao,
} from '@lumens/dominio';
import { z } from 'zod';
import type { MotivoFotoRecusada } from '../../fotos/servico';
import { BLOCK_NOT_FOUND_TEXT, blocoEscolhido, listaDeBlocos } from './blocos';
import type { DataPatch, Segredo, StepContext, StepHandler, StepResult } from './handlers';
import type { Resposta } from './resposta';
import { NEW_TITLE_TEXT, normalize } from './texto';

export const VERIFY_FIRST_TEXT =
  'Para criar uma pauta, você precisa ser estudante verificado. Vamos verificar o seu e-mail institucional: qual é ele?';
export const TITLE_EMPTY_TEXT = `O título não pode ficar em branco. ${NEW_TITLE_TEXT}`;
export const DESCRIPTION_QUESTION_TEXT =
  'Agora descreva o problema: o que acontece, onde (sala, andar) e desde quando.';
export const DESCRIPTION_EMPTY_TEXT = `A descrição não pode ficar em branco. ${DESCRIPTION_QUESTION_TEXT}`;
export const FROM_REPORT_DESCRIPTION_TEXT = 'Vou usar o seu relato como descrição da pauta.';
export const PHOTO_ASK_TEXT =
  "Envie uma foto do problema (JPEG ou PNG, até 5 MB), ou responda 'pular'.";
export const PHOTO_RECEIVED_TEXT = 'Foto recebida, obrigado!';
export const NO_PHOTO_TEXT = 'Ok, sem foto.';
export const NOT_VERIFIED_AT_END_TEXT =
  'Não consegui criar a pauta: o seu cadastro de estudante não está verificado. Escolha 3 no menu para verificar o e-mail.';
export const BLOCK_GONE_TEXT =
  'Não consegui criar a pauta: o bloco escolhido não existe mais. Escolha 2 no menu para começar de novo.';
export const DATA_LOST_TEXT =
  'Não consegui recuperar as respostas da sua pauta. Escolha 2 no menu para começar de novo.';

/** Foto que não deu para usar: a pessoa continua no passo da foto, para mandar outra ou pular. */
export function photoRefusedText(motivo: MotivoFotoRecusada): string {
  const porque: Record<MotivoFotoRecusada, string> = {
    formato: 'ela precisa ser JPEG ou PNG',
    tamanho: 'ela passa de 5 MB',
    invalida: 'o arquivo não abriu como imagem',
    indisponivel: 'não consegui baixar a foto agora',
  };
  return `Não consegui usar essa foto: ${porque[motivo]}. Envie outra foto ou responda 'pular'.`;
}

export function titleTooLongText(tamanho: number): string {
  return `Seu título tem ${String(tamanho)} caracteres e o limite é ${String(TITULO_MAXIMO)}. Escreva um título mais curto.`;
}

export function descriptionTooLongText(tamanho: number): string {
  return `Sua descrição tem ${String(tamanho)} caracteres e o limite é ${String(DESCRICAO_MAXIMA)}. Escreva uma descrição mais curta.`;
}

/**
 * Prazo da curadoria mostrado no resumo, ex.: "até 3 dias úteis". `null` enquanto a equipe não
 * definir: o resumo sai sem o prazo.
 */
export const CURADORIA: { prazo: string | null } = { prazo: null };

const SKIP_WORDS = new Set(['pular', 'nao', 'sem foto']);

/** O que os passos da pauta nova guardam na conversa. Validado: o dado pode ser de outra versão. */
const dadosSchema = z.object({
  tituloCifrado: z.string().optional(),
  descricaoCifrada: z.string().optional(),
  /** Da lista de blocos ou da 2.5. `null` = todo o campus. */
  blocoId: z.string().nullable().optional(),
  /** Da 2.5: o relato vira a descrição e o primeiro relato da pauta. */
  relatoCifrado: z.string().optional(),
});

function dadosDaPauta(data: unknown): z.infer<typeof dadosSchema> {
  const lidos = dadosSchema.safeParse(data);
  return lidos.success ? lidos.data : {};
}

/** Tira da conversa tudo o que a pauta nova (e o relato que a originou) guardou. */
const LIMPAR: DataPatch = {
  tituloCifrado: undefined,
  descricaoCifrada: undefined,
  blocoId: undefined,
  relatoCifrado: undefined,
  fotoMediaId: undefined,
  pendingCommand: undefined,
};

const tamanho = (texto: string) => Array.from(texto).length;

function decifrado(segredo: Segredo, cifrado: string | undefined): string | undefined {
  if (cifrado === undefined) return undefined;
  try {
    return segredo.decifrar(cifrado);
  } catch {
    return undefined;
  }
}

/** O estudante deste telefone, se ele pode criar pauta (RN01: verificado e não saiu). */
async function estudanteVerificado(db: Db, phoneHmac: string): Promise<string | undefined> {
  const [estudante] = await db
    .select({ id: estudantes.id, verificadoEm: estudantes.verificadoEm, saiuEm: estudantes.saiuEm })
    .from(estudantes)
    .where(eq(estudantes.telefoneHmac, phoneHmac));
  if (estudante === undefined) return undefined;
  return estudante.verificadoEm !== null && estudante.saiuEm === null ? estudante.id : undefined;
}

/**
 * Porta de entrada da pauta nova, pelo menu ou pelo relato (2.5). Quem não é estudante verificado
 * vai para a verificação antes de responder qualquer pergunta: assim ninguém escreve a pauta
 * inteira para ser recusado no fim. O pedido fica em `pendingCommand`, e os dados do relato, se
 * houver, continuam na conversa.
 */
export async function entrarNaPautaNova(
  { db, phoneHmac }: Pick<StepContext, 'db' | 'phoneHmac'>,
  antes: Resposta[] = [],
): Promise<StepResult> {
  if ((await estudanteVerificado(db, phoneHmac)) === undefined) {
    // TODO(2.4): ao terminar a verificação, retomar o `pendingCommand` 'nova-pauta' indo para
    // NEW_ASK_TITLE (falta a transição VERIFY_ASK_COURSE → NEW_ASK_TITLE em steps.ts).
    return {
      next: 'VERIFY_ASK_EMAIL',
      data: { pendingCommand: { kind: 'nova-pauta' } },
      replies: [...antes, VERIFY_FIRST_TEXT],
    };
  }
  return { next: 'NEW_ASK_TITLE', replies: [...antes, NEW_TITLE_TEXT] };
}

export const newAskTitle: StepHandler = async ({ state, input, db, segredo }) => {
  const titulo = input.text.trim();
  if (titulo === '') return { next: 'NEW_ASK_TITLE', replies: [TITLE_EMPTY_TEXT] };
  if (tamanho(titulo) > TITULO_MAXIMO) {
    return { next: 'NEW_ASK_TITLE', replies: [titleTooLongText(tamanho(titulo))] };
  }

  const data: DataPatch = { tituloCifrado: segredo.cifrar(titulo) };
  const { blocoId, relatoCifrado } = dadosDaPauta(state.data);

  if (blocoId === undefined) {
    return { next: 'NEW_ASK_PLACE', data, replies: [listaDeBlocos(await listarBlocos(db))] };
  }
  // Veio da 2.5: o lugar já foi respondido. O relato serve de descrição, se couber nela.
  const relato = decifrado(segredo, relatoCifrado);
  if (relato === undefined || tamanho(relato.trim()) > DESCRICAO_MAXIMA) {
    return { next: 'NEW_ASK_DESCRIPTION', data, replies: [DESCRIPTION_QUESTION_TEXT] };
  }
  return { next: 'NEW_ASK_PHOTO', data, replies: [FROM_REPORT_DESCRIPTION_TEXT, PHOTO_ASK_TEXT] };
};

export const newAskPlace: StepHandler = async ({ input, db }) => {
  const lista = await listarBlocos(db);
  const escolha = blocoEscolhido(input.text, lista);
  if (escolha === undefined) {
    return { next: 'NEW_ASK_PLACE', replies: [BLOCK_NOT_FOUND_TEXT, listaDeBlocos(lista)] };
  }
  return {
    next: 'NEW_ASK_DESCRIPTION',
    data: { blocoId: escolha.blocoId },
    replies: [DESCRIPTION_QUESTION_TEXT],
  };
};

export const newAskDescription: StepHandler = ({ input, segredo }) => {
  const descricao = input.text.trim();
  if (descricao === '') return { next: 'NEW_ASK_DESCRIPTION', replies: [DESCRIPTION_EMPTY_TEXT] };
  if (tamanho(descricao) > DESCRICAO_MAXIMA) {
    return { next: 'NEW_ASK_DESCRIPTION', replies: [descriptionTooLongText(tamanho(descricao))] };
  }
  return {
    next: 'NEW_ASK_PHOTO',
    data: { descricaoCifrada: segredo.cifrar(descricao) },
    replies: [PHOTO_ASK_TEXT],
  };
};

/**
 * Pede a foto. Aceita a foto ou "pular"; qualquer outro texto pede de novo. A foto é baixada,
 * limpa e guardada na hora (`ServicoDeFotos`): se não der, a pessoa fica sabendo e pode mandar
 * outra ou pular.
 */
export const newAskPhoto: StepHandler = async (ctx) => {
  const { image } = ctx.input;
  if (image) {
    const foto = ctx.fotos
      ? await ctx.fotos.guardarFoto(image)
      : ({ ok: false, motivo: 'indisponivel' } as const);
    if (!foto.ok) return { next: 'NEW_ASK_PHOTO', replies: [photoRefusedText(foto.motivo)] };
    return finalizar(ctx, foto.chave);
  }
  if (SKIP_WORDS.has(normalize(ctx.input.text))) return finalizar(ctx, null);
  return { next: 'NEW_ASK_PHOTO', replies: [PHOTO_ASK_TEXT] };
};

/** Junta as respostas, cria a pauta e responde com o resumo. Sempre volta ao menu. */
async function finalizar(ctx: StepContext, fotoChave: string | null): Promise<StepResult> {
  const { state, db, segredo, phoneHmac } = ctx;
  const comFoto = fotoChave !== null;
  const antes = comFoto ? PHOTO_RECEIVED_TEXT : NO_PHOTO_TEXT;
  const fim = (texto: string): StepResult => ({ next: 'MENU', data: LIMPAR, replies: [texto] });

  const dados = dadosDaPauta(state.data);
  const titulo = decifrado(segredo, dados.tituloCifrado);
  const relato = decifrado(segredo, dados.relatoCifrado);
  const descricao = decifrado(segredo, dados.descricaoCifrada) ?? relato;
  if (titulo === undefined || descricao === undefined || dados.blocoId === undefined) {
    return fim(DATA_LOST_TEXT);
  }
  const blocoId = dados.blocoId;

  // Confere de novo no fim: o estudante pode ter saído no meio da conversa.
  const estudanteId = await estudanteVerificado(db, phoneHmac);
  if (estudanteId === undefined) return fim(NOT_VERIFIED_AT_END_TEXT);

  // Se a pauta não for criada (recusa abaixo), a foto já enviada fica sem dono no storage. É raro
  // (estudante que saiu no meio, bloco apagado) e não expõe ninguém: o arquivo não tem metadados.
  const resultado = await db.transaction((tx) =>
    criarPauta(tx, {
      estudanteId,
      titulo,
      descricao,
      blocoId,
      fotoChave,
      ...(relato === undefined ? {} : { relato }),
    }),
  );

  if (!resultado.criada) return fim(textoDaRecusa(resultado.motivo));
  return {
    next: 'MENU',
    data: LIMPAR,
    replies: [antes, await resumo(db, { titulo, blocoId, meta: resultado.meta, comFoto })],
  };
}

function textoDaRecusa(motivo: Extract<ResultadoCriacao, { criada: false }>['motivo']): string {
  switch (motivo) {
    case 'estudante_nao_verificado':
      return NOT_VERIFIED_AT_END_TEXT;
    case 'bloco_inexistente':
      return BLOCK_GONE_TEXT;
    // Título e descrição já foram conferidos nos passos; se chegarem errados, o dado se perdeu.
    case 'titulo_vazio':
    case 'titulo_longo':
    case 'descricao_vazia':
    case 'descricao_longa':
      return DATA_LOST_TEXT;
  }
}

/** O resumo que confirma a pauta criada. */
export async function resumo(
  db: Db,
  pauta: { titulo: string; blocoId: string | null; meta: number; comFoto: boolean },
): Promise<string> {
  let local = 'Todo o campus';
  if (pauta.blocoId !== null) {
    const [bloco] = await db
      .select({ nome: blocos.nome })
      .from(blocos)
      .where(eq(blocos.id, pauta.blocoId));
    local = bloco?.nome ?? local;
  }
  const linhas = [
    'Pauta enviada para a curadoria! ✅',
    '',
    `*Título:* ${pauta.titulo}`,
    `*Local:* ${local}`,
    `*Meta:* ${String(pauta.meta)} apoios`,
    `*Foto:* ${pauta.comFoto ? 'sim' : 'não'}`,
    '',
    'Antes de aparecer no site, a curadoria confere a pauta. Você recebe uma mensagem quando ela for aprovada ou recusada.',
  ];
  if (CURADORIA.prazo !== null) linhas.push(`A curadoria responde ${CURADORIA.prazo}.`);
  return linhas.join('\n');
}
