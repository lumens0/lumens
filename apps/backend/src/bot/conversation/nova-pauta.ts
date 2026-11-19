/**
 * História 2.6 · Criar pauta nova pela conversa (RF-B03, RN06).
 *
 *   "2 Nova pauta" ──┐
 *   2.5 "É outro" ───┴─▶ estudante verificado? ──não──▶ VERIFY_ASK_EMAIL (2.4), guardando o pedido
 *                              │ sim
 *                              ▼
 *   NEW_ASK_TITLE ──▶ NEW_ASK_PLACE ──▶ NEW_ASK_CATEGORY ──▶ NEW_ASK_DESCRIPTION ──▶ NEW_ASK_PHOTO
 *        │  (lista de blocos) │               ▲  (lista de categorias)                  │
 *        │                    └─ parecida? ─▶ NEW_PICK_SIMILAR ─"É outro"      criarPauta + resumo
 *        │                                  "É essa" → apoio (2.7)
 *        └── veio da 2.5: o bloco e o relato já estão nos dados, vai direto à categoria
 *
 * A categoria (SCRUM-357) vem logo depois do bloco e da checagem de pautas parecidas. "Outra" deixa
 * a pauta como `a_classificar`, para a curadoria. Vindo da 2.5, o relato serve de descrição e a
 * descrição é pulada, se couber.
 *
 * Pelo menu, o título e o bloco passam pela mesma busca de pautas parecidas do relato (SCRUM-346):
 * sem ela, a pauta repetida dividia os apoios. Quem vem da 2.5 já viu a lista e não passa de novo.
 *
 * Tudo o que a pessoa escreve fica cifrado nos dados da conversa, como o relato da 2.5: a tabela
 * `conversa` guarda o passo de cada telefone por 24h. A pauta só é gravada no último passo, por
 * `criarPauta` (domínio), na mesma transação da conversa.
 */
import { blocos, eq, type Db } from '@lumens/db';
import {
  CATEGORIAS,
  DESCRICAO_MAXIMA,
  PRAZO_DE_CURADORIA_MS,
  TITULO_MAXIMO,
  buscarPautasParecidas,
  FOTOS_POR_RELATO_MAXIMO,
  criarPauta,
  listarBlocos,
  sugerirCategoria,
  type Categoria,
  type ResultadoCriacao,
} from '@lumens/dominio';
import { z } from 'zod';
import type { MotivoFotoRecusada } from '../../fotos/servico';
import { BLOCK_NOT_FOUND_TEXT, blocoEscolhido, listaDeBlocos } from './blocos';
import {
  CATEGORY_NOT_FOUND_TEXT,
  OTHER_CATEGORY,
  categoriaEscolhida,
  confirmacaoDaCategoria,
  listaDeCategorias,
  respostaDaSugestao,
} from './categorias';
import { estudanteVerificado } from './estudante';
import { removerFotosSoltas } from './fotos-temporarias';
import type { DataPatch, Segredo, StepContext, StepHandler, StepResult } from './handlers';
import { listaDeParecidas, type Parecida } from './parecidas';
import type { Resposta } from './resposta';
import { NEW_TITLE_TEXT, normalize } from './texto';

export const VERIFY_FIRST_TEXT =
  'Para criar uma pauta, você precisa verificar o seu e-mail institucional. Qual é ele?';
export const TITLE_EMPTY_TEXT = `O título não pode ficar em branco. ${NEW_TITLE_TEXT}`;
export const DESCRIPTION_QUESTION_TEXT =
  'Agora descreva o problema: o que acontece, onde (sala, andar) e desde quando.';
export const DESCRIPTION_EMPTY_TEXT = `A descrição não pode ficar em branco. ${DESCRIPTION_QUESTION_TEXT}`;
export const NEW_SIMILAR_LIST_TEXT =
  'Já existem pautas abertas parecidas com a sua. Se uma delas for o mesmo problema, apoie a que já existe: pauta com mais apoio tem mais força.';
export const FROM_REPORT_DESCRIPTION_TEXT = 'Vou usar o seu relato como descrição da pauta.';
export const PHOTO_ASK_TEXT =
  `Envie uma foto do problema (JPEG ou PNG, até 5 MB), ou responda *pular*. Dá para mandar até ${String(FOTOS_POR_RELATO_MAXIMO)} fotos, uma por mensagem.` +
  ' As fotos aparecem no site, sem o seu nome, depois de aprovadas pela curadoria, que pode recusar cada uma. Não mostre rosto, placa nem documento. Ao enviar, você concorda com essa publicação (LGPD, art. 7º, I).';
export const PHOTO_RECEIVED_TEXT = 'Foto recebida, obrigado!';
export const PHOTOS_RECEIVED_TEXT = 'Fotos recebidas, obrigado!';

/** Depois de cada foto aceita, enquanto ainda cabe outra: manda mais uma ou fecha com *pronto*. */
export function photoMoreText(recebidas: number): string {
  return `Foto ${String(recebidas)} de ${String(FOTOS_POR_RELATO_MAXIMO)} recebida ✅ Quer mandar mais alguma? Envie outra foto ou responda *pronto*. Para voltar ao menu, mande *menu*.`;
}
export const NO_PHOTO_TEXT = 'Ok, sem foto.';
export const NOT_VERIFIED_AT_END_TEXT =
  'Não consegui criar a pauta: falta verificar o seu e-mail institucional. Mande *menu* e escolha *Verificar e-mail* para verificar.';
export const BLOCK_GONE_TEXT =
  'Não consegui criar a pauta: o bloco escolhido não existe mais. Mande *menu* e escolha *Nova pauta* para começar de novo.';
export const DATA_LOST_TEXT =
  'Não consegui recuperar as respostas da sua pauta. Mande *menu* e escolha *Nova pauta* para começar de novo.';

/** Foto que não deu para usar: a pessoa continua no passo da foto, para mandar outra ou pular. */
export function photoRefusedText(motivo: MotivoFotoRecusada, recebidas = 0): string {
  // Storage fora do ar: outra foto falharia igual, então o texto não sugere mandar outra (SCRUM-330).
  if (motivo === 'armazenamento') {
    return `Não consegui guardar a foto: o envio de fotos está fora do ar agora. Responda *${recebidas > 0 ? 'pronto' : 'pular'}* para seguir${recebidas > 0 ? '' : ' sem foto'}.`;
  }
  const porque: Record<Exclude<MotivoFotoRecusada, 'armazenamento'>, string> = {
    formato: 'ela precisa ser JPEG ou PNG',
    tamanho: 'ela passa de 5 MB',
    invalida: 'o arquivo não abriu como imagem',
    indisponivel: 'não consegui baixar a foto agora',
  };
  return `Não consegui usar essa foto: ${porque[motivo]}. Envie outra foto ou responda *${recebidas > 0 ? 'pronto' : 'pular'}*.`;
}

export function titleTooLongText(tamanho: number): string {
  return `Seu título tem ${String(tamanho)} caracteres e o limite é ${String(TITULO_MAXIMO)}. Escreva um título mais curto.`;
}

export function descriptionTooLongText(tamanho: number): string {
  return `Sua descrição tem ${String(tamanho)} caracteres e o limite é ${String(DESCRICAO_MAXIMA)}. Escreva uma descrição mais curta.`;
}

/**
 * O prazo da curadoria no resumo. Vem do mesmo `PRAZO_DE_CURADORIA_MS` que a fila do painel usa
 * (SCRUM-113): se a equipe mudar o prazo no domínio, o bot acompanha.
 */
export const CURADORIA_PRAZO_TEXT = `A curadoria responde em até ${String(PRAZO_DE_CURADORIA_MS / 3_600_000)} horas.`;

/** "Não vou mandar foto" ou "terminei as fotos": o que fecha o passo da foto. */
export const SKIP_WORDS = new Set(['pular', 'nao', 'n', 'sem foto', 'pronto', 'so essa', 'chega']);

/** O que os passos da pauta nova guardam na conversa. Validado: o dado pode ser de outra versão. */
const dadosSchema = z.object({
  tituloCifrado: z.string().optional(),
  descricaoCifrada: z.string().optional(),
  /** Da lista de blocos ou da 2.5. `null` = todo o campus. */
  blocoId: z.string().nullable().optional(),
  /** Da lista de categorias (`outra` = sem categoria, a curadoria classifica). */
  categoria: z.string().optional(),
  /** A sugestão por palavras-chave, esperando o estudante confirmar (SCRUM-365). */
  categoriaSugerida: z.string().optional(),
  /** Da 2.5: o relato vira a descrição e o primeiro relato da pauta. */
  relatoCifrado: z.string().optional(),
  /** Chaves das fotos já guardadas no storage (até o limite), na ordem de envio. */
  fotoChaves: z.array(z.string()).max(FOTOS_POR_RELATO_MAXIMO).optional(),
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
  categoria: undefined,
  categoriaSugerida: undefined,
  relatoCifrado: undefined,
  fotoChaves: undefined,
  parecidas: undefined,
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
    // Ao fim da verificação (2.4), `verifyAskCourse` vê o `pendingCommand` e volta para cá.
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
  const { blocoId } = dadosDaPauta(state.data);

  if (blocoId === undefined) {
    return { next: 'NEW_ASK_PLACE', data, replies: [listaDeBlocos(await listarBlocos(db))] };
  }
  // Veio da 2.5: o lugar já foi respondido, falta a categoria.
  const { relatoCifrado } = dadosDaPauta(state.data);
  return perguntarCategoria(
    [titulo, decifrado(segredo, relatoCifrado)].filter((t) => t !== undefined).join('\n'),
    data,
  );
};

export const newAskPlace: StepHandler = async ({ state, input, db, segredo }) => {
  const lista = await listarBlocos(db);
  const escolha = blocoEscolhido(input.text, lista);
  if (escolha === undefined) {
    return { next: 'NEW_ASK_PLACE', replies: [BLOCK_NOT_FOUND_TEXT, listaDeBlocos(lista)] };
  }
  const data: DataPatch = { blocoId: escolha.blocoId };

  // O título faz o papel do relato na busca. Sem ele (dado perdido), segue: o fim avisa.
  const tituloDaPauta = decifrado(segredo, dadosDaPauta(state.data).tituloCifrado);
  if (tituloDaPauta !== undefined) {
    const achadas = await buscarPautasParecidas(db, {
      relato: tituloDaPauta,
      blocoId: escolha.blocoId,
    });
    const parecidas: Parecida[] = achadas.map(({ id, titulo, descricao }) => ({
      id,
      titulo,
      descricao,
    }));
    if (parecidas.length > 0) {
      return {
        next: 'NEW_PICK_SIMILAR',
        data: { ...data, parecidas },
        replies: [listaDeParecidas(parecidas, NEW_SIMILAR_LIST_TEXT)],
      };
    }
  }
  return perguntarCategoria(tituloDaPauta, data);
};

/**
 * Abre a pergunta da categoria. O texto da pauta (título e, vindo da 2.5, o relato) passa pelas
 * palavras-chave do domínio, no servidor (SCRUM-365): com uma categoria vencendo com clareza, o
 * bot sugere e o estudante confirma; com empate ou sem palavra reconhecida, mostra a lista.
 * O texto não é guardado nem enviado a lugar nenhum: só o id da categoria sugerida fica na conversa.
 */
export function perguntarCategoria(
  texto: string | undefined,
  data: DataPatch = {},
  antes: Resposta[] = [],
): StepResult {
  const sugerida = texto === undefined ? undefined : sugerirCategoria(texto);
  if (sugerida === undefined) {
    return {
      next: 'NEW_ASK_CATEGORY',
      data: { ...data, categoriaSugerida: undefined },
      replies: [...antes, listaDeCategorias()],
    };
  }
  return {
    next: 'NEW_CONFIRM_CATEGORY',
    data: { ...data, categoriaSugerida: sugerida },
    replies: [...antes, confirmacaoDaCategoria(sugerida)],
  };
}

/** O texto da pauta até aqui (título e relato da 2.5), para a sugestão de categoria. */
export function textoDaPauta(segredo: Segredo, data: unknown): string | undefined {
  const { tituloCifrado, relatoCifrado } = dadosDaPauta(data);
  const texto = [decifrado(segredo, tituloCifrado), decifrado(segredo, relatoCifrado)]
    .filter((t) => t !== undefined)
    .join('\n');
  return texto === '' ? undefined : texto;
}

/**
 * A categoria: a linha da lista ou o nome digitado. Resposta que não vale repete a lista, sem
 * perder o que já foi respondido. Vindo da 2.5, o relato serve de descrição, se couber nela.
 */
export const newAskCategory: StepHandler = ({ state, input, segredo }) => {
  const categoria = categoriaEscolhida(input.text);
  if (categoria === undefined) {
    return {
      next: 'NEW_ASK_CATEGORY',
      replies: [CATEGORY_NOT_FOUND_TEXT, listaDeCategorias()],
    };
  }
  return depoisDaCategoria(state.data, segredo, categoria);
};

/**
 * A resposta à sugestão (SCRUM-365). "Confirmar" vale a categoria sugerida; "Escolher outra" abre
 * a lista completa; o nome de uma categoria digitado também vale. O resto repete a pergunta.
 */
export const newConfirmCategory: StepHandler = ({ state, input, segredo }) => {
  const { categoriaSugerida } = dadosDaPauta(state.data);
  const sugerida = categoriaEscolhida(categoriaSugerida ?? '');
  if (sugerida === undefined || sugerida === OTHER_CATEGORY) {
    return { next: 'NEW_ASK_CATEGORY', replies: [listaDeCategorias()] };
  }
  const resposta = respostaDaSugestao(input.text);
  if (resposta === 'confirmar') return depoisDaCategoria(state.data, segredo, sugerida);
  if (resposta === 'escolher') return { next: 'NEW_ASK_CATEGORY', replies: [listaDeCategorias()] };
  // Escolheu na mão, sem tocar nos botões: vale como a lista.
  const digitada = categoriaEscolhida(input.text);
  if (digitada !== undefined) return depoisDaCategoria(state.data, segredo, digitada);
  return { next: 'NEW_CONFIRM_CATEGORY', replies: [confirmacaoDaCategoria(sugerida)] };
};

/** Guarda a categoria e segue: a descrição, ou a foto quando o relato da 2.5 já a cobre. */
function depoisDaCategoria(
  dados: unknown,
  segredo: Segredo,
  categoria: NonNullable<ReturnType<typeof categoriaEscolhida>>,
): StepResult {
  const data: DataPatch = { categoria, categoriaSugerida: undefined };
  const relato = decifrado(segredo, dadosDaPauta(dados).relatoCifrado);
  if (relato === undefined || tamanho(relato.trim()) > DESCRICAO_MAXIMA) {
    return { next: 'NEW_ASK_DESCRIPTION', data, replies: [DESCRIPTION_QUESTION_TEXT] };
  }
  return { next: 'NEW_ASK_PHOTO', data, replies: [FROM_REPORT_DESCRIPTION_TEXT, PHOTO_ASK_TEXT] };
}

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
  const jaRecebidas = dadosDaPauta(ctx.state.data).fotoChaves ?? [];
  if (image) {
    const foto = ctx.fotos
      ? await ctx.fotos.guardarFoto(image)
      : ({ ok: false, motivo: 'indisponivel' } as const);
    if (!foto.ok) {
      return {
        next: 'NEW_ASK_PHOTO',
        replies: [photoRefusedText(foto.motivo, jaRecebidas.length)],
      };
    }
    const fotoChaves = [...jaRecebidas, foto.chave];
    // No limite, fecha sozinho: não há o que perguntar.
    if (fotoChaves.length >= FOTOS_POR_RELATO_MAXIMO) return finalizar(ctx, fotoChaves);
    return {
      next: 'NEW_ASK_PHOTO',
      data: { fotoChaves },
      replies: [photoMoreText(fotoChaves.length)],
    };
  }
  if (SKIP_WORDS.has(normalize(ctx.input.text))) return finalizar(ctx, jaRecebidas);
  return {
    next: 'NEW_ASK_PHOTO',
    replies: [jaRecebidas.length > 0 ? photoMoreText(jaRecebidas.length) : PHOTO_ASK_TEXT],
  };
};

/** Junta as respostas, cria a pauta e responde com o resumo. Sempre volta ao menu. */
async function finalizar(ctx: StepContext, fotoChaves: readonly string[]): Promise<StepResult> {
  const { state, db, segredo, phoneHmac } = ctx;
  const comFoto = fotoChaves.length > 0;
  const antes = !comFoto
    ? NO_PHOTO_TEXT
    : fotoChaves.length === 1
      ? PHOTO_RECEIVED_TEXT
      : PHOTOS_RECEIVED_TEXT;
  // Pauta não criada: as fotos já estão no storage e nenhum relato as guarda, então saem daqui.
  const fim = async (texto: string): Promise<StepResult> => {
    await removerFotosSoltas(db, ctx.fotos, fotoChaves);
    return { next: 'MENU', data: LIMPAR, replies: [texto] };
  };

  const dados = dadosDaPauta(state.data);
  const titulo = decifrado(segredo, dados.tituloCifrado);
  const relato = decifrado(segredo, dados.relatoCifrado);
  const descricao = decifrado(segredo, dados.descricaoCifrada) ?? relato;
  if (titulo === undefined || descricao === undefined || dados.blocoId === undefined) {
    return await fim(DATA_LOST_TEXT);
  }
  const blocoId = dados.blocoId;
  // Sem escolha ou "Outra": entra como `a_classificar` e a curadoria classifica.
  const escolha = categoriaEscolhida(dados.categoria ?? '');
  const categoria = escolha === undefined || escolha === OTHER_CATEGORY ? undefined : escolha;

  // Confere de novo no fim: o estudante pode ter saído no meio da conversa.
  const estudanteId = await estudanteVerificado(db, phoneHmac);
  if (estudanteId === undefined) return await fim(NOT_VERIFIED_AT_END_TEXT);

  // Se a pauta não for criada (recusa abaixo), a foto já enviada fica sem dono no storage. É raro
  // (estudante que saiu no meio, bloco apagado) e não expõe ninguém: o arquivo não tem metadados.
  const resultado = await db.transaction((tx) =>
    criarPauta(tx, {
      estudanteId,
      titulo,
      descricao,
      blocoId,
      fotoChaves,
      ...(categoria === undefined ? {} : { categoria }),
      ...(relato === undefined ? {} : { relato }),
    }),
  );

  if (!resultado.criada) return await fim(textoDaRecusa(resultado.motivo));
  return {
    next: 'MENU',
    data: LIMPAR,
    replies: [
      antes,
      await resumo(db, { titulo, blocoId, categoria: escolha, meta: resultado.meta, comFoto }),
    ],
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
    case 'fotos_demais':
      return DATA_LOST_TEXT;
  }
}

/** O resumo que confirma a pauta criada. */
export async function resumo(
  db: Db,
  pauta: {
    titulo: string;
    blocoId: string | null;
    categoria?: Categoria | typeof OTHER_CATEGORY | undefined;
    meta: number;
    comFoto: boolean;
  },
): Promise<string> {
  let local = 'Todo o campus';
  if (pauta.blocoId !== null) {
    const [bloco] = await db
      .select({ nome: blocos.nome })
      .from(blocos)
      .where(eq(blocos.id, pauta.blocoId));
    local = bloco?.nome ?? local;
  }
  const categoria =
    pauta.categoria === undefined
      ? undefined
      : pauta.categoria === OTHER_CATEGORY
        ? 'Outra'
        : CATEGORIAS[pauta.categoria];
  const linhas = [
    'Pauta enviada para a curadoria! ✅',
    '',
    `*Título:* ${pauta.titulo}`,
    `*Local:* ${local}`,
    ...(categoria === undefined ? [] : [`*Categoria:* ${categoria}`]),
    `*Meta:* ${String(pauta.meta)} apoios`,
    `*Foto:* ${pauta.comFoto ? 'sim' : 'não'}`,
    '',
    'Antes de aparecer no site, a curadoria confere a pauta e avisa você da decisão.',
    CURADORIA_PRAZO_TEXT,
  ];
  return linhas.join('\n');
}
