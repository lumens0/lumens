import { z } from 'zod';

/**
 * Contrato da API de leitura pública (SCRUM-88 · T15), compartilhado entre o back-end e o site.
 *
 * Cada esquema lista os campos explicitamente: o back-end converte estes esquemas em JSON Schema
 * de resposta, e o Fastify descarta qualquer campo não declarado. Um campo novo numa view NÃO
 * chega ao site até ser declarado aqui.
 *
 * Instantes (`timestamptz`) saem como ISO 8601 em UTC; datas (`date`) como `AAAA-MM-DD`.
 */

/**
 * Origem pública do site em produção. Padrão do CORS da API (`CORS_ORIGENS`) e da base das URLs
 * absolutas dos metadados do site (`LUMENS_SITE_URL`): um lugar só, para o domínio mudar junto.
 */
export const ORIGEM_SITE_PRODUCAO = 'https://lumens-ufal.vercel.app';

/**
 * Status em que a pauta não recebe apoio: ainda não aprovada, recusada ou já conquistada (status
 * final). Uma lista só, para o bot, o painel e o site nunca discordarem: antes o site tinha uma
 * cópia e podia mostrar "Apoiar" numa pauta que o bot recusa (SCRUM-294).
 * `entregue_em_parte` e `descumprida` continuam recebendo: seguem sendo cobradas.
 */
export const STATUS_SEM_APOIO = ['em_curadoria', 'recusada', 'conquistada'] as const;

/** Slug de pauta ou bloco: minúsculas, dígitos e hífens, sem hífen nas pontas nem repetido. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 120;
export const slug = z.string().min(1).max(SLUG_MAX).regex(SLUG);

export const LIMITE_PADRAO = 20;
export const LIMITE_MAXIMO = 100;

/** Os sete status que o site pode ver; os demais nunca saem da API. */
export const STATUS_PUBLICOS = [
  'juntando_apoios',
  'meta_batida',
  'cobrando',
  'prometido',
  'entregue_em_parte',
  'descumprida',
  'conquistada',
] as const;
export const statusPublico = z.enum(STATUS_PUBLICOS);
export type StatusPublico = z.infer<typeof statusPublico>;

const instante = z.iso.datetime();
const data = z.iso.date();

/** Paginação por `offset`: `proximo` é o offset da página seguinte, ou nulo na última. */
export const paginacaoQuery = z.object({
  limit: z.coerce.number().int().min(1).max(LIMITE_MAXIMO).default(LIMITE_PADRAO),
  offset: z.coerce.number().int().min(0).default(0),
});
export type PaginacaoQuery = z.infer<typeof paginacaoQuery>;

function pagina<T extends z.ZodType>(item: T) {
  return z.object({ itens: z.array(item), proximo: z.number().int().nullable() });
}

// GET /resumo — v_resumo
export const resumo = z.object({
  pautas_abertas: z.number().int(),
  apoios: z.number().int(),
  conquistas: z.number().int(),
});
export type Resumo = z.infer<typeof resumo>;

// GET /apoios-por-semana — v_apoio_semana
/** Semanas devolvidas: a atual e as sete anteriores, sempre todas (as vazias vêm com zero). */
export const SEMANAS_DE_APOIO = 8;
export const apoiosPorSemanaQuery = z.object({ bloco: slug.optional() });
export type ApoiosPorSemanaQuery = z.infer<typeof apoiosPorSemanaQuery>;

export const apoioSemana = z.object({
  /** Segunda-feira da semana (UTC), `AAAA-MM-DD`. */
  semana: data,
  apoios: z.number().int(),
});
export const apoiosPorSemana = z.object({ itens: z.array(apoioSemana) });
export type ApoioSemana = z.infer<typeof apoioSemana>;
export type ApoiosPorSemana = z.infer<typeof apoiosPorSemana>;

// GET /blocos — v_bloco
export const bloco = z.object({
  slug: z.string(),
  nome: z.string(),
  base_estudantes: z.number().int(),
});
export const blocos = z.object({ itens: z.array(bloco) });
export type Bloco = z.infer<typeof bloco>;
export type Blocos = z.infer<typeof blocos>;

// GET /pautas — v_pauta_publica
export const pautasQuery = paginacaoQuery.extend({
  bloco: slug.optional(),
  status: statusPublico.optional(),
});
export type PautasQuery = z.infer<typeof pautasQuery>;

export const pauta = z.object({
  slug: z.string(),
  titulo: z.string(),
  descricao: z.string(),
  categoria: z.string(),
  status: statusPublico,
  urgente: z.boolean(),
  meta: z.number().int(),
  apoios: z.number().int(),
  /** Nulo quando a pauta é do campus inteiro. */
  bloco_slug: z.string().nullable(),
  bloco_nome: z.string().nullable(),
  cursos_responsaveis: z.array(z.string()),
  criada_em: instante,
  aprovada_em: instante.nullable(),
  meta_batida_em: instante.nullable(),
  proxima_etapa: z.string().nullable(),
});
export const pautas = pagina(pauta);
export type Pauta = z.infer<typeof pauta>;
export type Pautas = z.infer<typeof pautas>;

// GET /pautas/:slug — v_pauta_publica + v_relato_publico + v_caminho_publico + v_linha_do_tempo
export const pautaParams = z.object({ slug });

export const relato = z.object({
  texto: z.string(),
  /** Fotos aprovadas do relato, em ordem (até três); vazio quando não há. */
  fotos: z.array(z.string()),
  curso: z.string().nullable(),
  moderado_em: instante.nullable(),
});
export type Relato = z.infer<typeof relato>;

export const caminho = z.object({
  tipo: z.enum(['falabr', 'comunidade', 'representante', 'proposta']),
  status: z.string(),
  protocolo: z.string().nullable(),
  prazo: data.nullable(),
  prorrogado: z.boolean(),
  aberto_em: instante.nullable(),
  descricao: z.string().nullable(),
  pessoas_necessarias: z.number().int().nullable(),
  voluntarios: z.number().int().nullable(),
  executada_em: instante.nullable(),
});
export type Caminho = z.infer<typeof caminho>;

/** Payload do catálogo da T7, já sem as chaves `id` e `*_id` (a view remove). */
export const evento = z.object({
  tipo: z.string(),
  dados: z.record(z.string(), z.unknown()),
  criado_em: instante,
});
export type Evento = z.infer<typeof evento>;

/**
 * "O que foi feito" que a curadoria escreve para a pauta conquistada (SCRUM-394): texto de até 160
 * caracteres e UMA foto sem metadados. Os dois vêm nulos fora de `conquistada` e enquanto a curadoria
 * não escreve. `foto` é a chave do arquivo, no mesmo formato de `relato.fotos`: o site a serve por
 * `/fotos/...`, que só abre a foto da conquista com a pauta conquistada.
 */
export const oQueFoiFeito = {
  o_que_foi_feito: z.string().nullable(),
  foto: z.string().nullable(),
};

export const pautaDetalhe = pauta.extend({
  relatos: z.array(relato),
  caminhos: z.array(caminho),
  linha_do_tempo: z.array(evento),
  ...oQueFoiFeito,
});
export type PautaDetalhe = z.infer<typeof pautaDetalhe>;

// GET /conquistas — v_conquista
export const conquista = z.object({
  pauta_slug: z.string(),
  titulo: z.string(),
  bloco_nome: z.string().nullable(),
  conquistada_em: instante.nullable(),
  apoios: z.number().int(),
  proposta_executada: z.boolean(),
  /** Criação da pauta: o site conta os dias até a entrega. */
  criada_em: instante,
  ...oQueFoiFeito,
});
export const conquistas = z.object({ itens: z.array(conquista) });
export type Conquista = z.infer<typeof conquista>;
export type Conquistas = z.infer<typeof conquistas>;

// GET /atividade — v_atividade
export const atividadeItem = evento.extend({
  pauta_slug: z.string(),
  pauta_titulo: z.string(),
});
export const atividade = pagina(atividadeItem);
export type AtividadeItem = z.infer<typeof atividadeItem>;
export type Atividade = z.infer<typeof atividade>;

/** Corpo de 400 e 404. O 404 não diz se a pauta não existe ou não é pública. */
export const erro = z.object({ erro: z.string() });
export type Erro = z.infer<typeof erro>;

/**
 * Lista oficial das categorias de pauta (SCRUM-291), usada pelo site, pelo painel e pelo domínio.
 * A chave é o valor gravado em `pauta.categoria`; o valor é o rótulo mostrado às pessoas.
 * `a_classificar` fica de fora de propósito: pauta ainda não classificada não tem rótulo.
 */
export const CATEGORIAS = {
  infraestrutura: 'Infraestrutura',
  seguranca: 'Segurança',
  acessibilidade: 'Acessibilidade',
  ensino: 'Ensino',
  permanencia: 'Permanência',
  servicos: 'Serviços',
  tecnologia: 'Tecnologia',
} as const;
export type Categoria = keyof typeof CATEGORIAS;

/** Se o valor é uma das categorias oficiais. Chaves herdadas (`toString`, `__proto__`) não contam. */
export function ehCategoria(valor: string): valor is Categoria {
  return Object.hasOwn(CATEGORIAS, valor);
}

/** Rótulo da categoria; `undefined` para `a_classificar` ou qualquer valor fora da lista. */
export function rotuloDaCategoria(valor: string): string | undefined {
  const chave = valor.trim();
  return ehCategoria(chave) ? CATEGORIAS[chave] : undefined;
}

/**
 * Só entrada e saída de responsável se juntam: o evento não leva quem entrou ou saiu, então as
 * linhas são mesmo idênticas. Outros tipos parecem iguais nas views públicas (que tiram o id do
 * relato, por exemplo) mas são acontecimentos diferentes, como dois relatos aprovados no mesmo
 * minuto: cada um continua com a sua linha.
 */
const TIPOS_DE_RESPONSAVEL: ReadonlySet<string> = new Set(['owner_entrou', 'owner_removido']);

/**
 * Junta eventos iguais seguidos (SCRUM-355). Quando várias pessoas saem de uma pauta de uma vez (a
 * rotina de inatividade do agendador tira todos os responsáveis inativos na mesma rodada), cada
 * saída é um `owner_removido` com o mesmo papel e o mesmo minuto: o evento não leva quem saiu
 * (privacidade), então as linhas ficam idênticas. A lista mostra uma linha com a quantidade.
 *
 * Só junta vizinhos: dois eventos iguais separados por outro acontecimento continuam separados, e
 * a ordem não muda. `instante` devolve a hora do evento; `origem` (opcional) entra na comparação.
 */
export function agruparEventosIguais<E extends { tipo: string; dados: Record<string, unknown> }>(
  eventos: readonly E[],
  instante: (evento: E) => Date | string,
  origem: (evento: E) => string = () => '',
): { evento: E; quantidade: number }[] {
  const minuto = (e: E) => Math.floor(new Date(instante(e)).getTime() / 60_000);
  const mesmo = (a: E, b: E) =>
    TIPOS_DE_RESPONSAVEL.has(a.tipo) &&
    a.tipo === b.tipo &&
    origem(a) === origem(b) &&
    minuto(a) === minuto(b) &&
    JSON.stringify(a.dados) === JSON.stringify(b.dados);
  const grupos: { evento: E; quantidade: number }[] = [];
  for (const evento of eventos) {
    const ultimo = grupos.at(-1);
    if (ultimo && mesmo(ultimo.evento, evento)) ultimo.quantidade += 1;
    else grupos.push({ evento, quantidade: 1 });
  }
  return grupos;
}

/**
 * Rótulo de um grupo de saídas ou entradas de responsável: "3 responsáveis saíram",
 * "2 corresponsáveis saíram". `undefined` para outro tipo ou para um evento só (vale o rótulo
 * do tipo).
 */
export function rotuloDeResponsaveis(
  tipo: string,
  dados: Record<string, unknown>,
  quantidade: number,
): string | undefined {
  if (quantidade < 2 || (tipo !== 'owner_removido' && tipo !== 'owner_entrou')) return undefined;
  const co = dados.papel === 'co_owner';
  const n = String(quantidade);
  if (tipo === 'owner_removido')
    return `${n} ${co ? 'corresponsáveis saíram' : 'responsáveis saíram'}`;
  return `${n} ${co ? 'novos corresponsáveis' : 'novos responsáveis'}`;
}
