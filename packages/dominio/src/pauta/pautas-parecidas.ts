/**
 * RF-B01 · RF-B02 · Pautas parecidas com um relato (história 2.5).
 *
 * Quem relata um problema pelo bot vê, antes de abrir pauta nova, até três pautas abertas que
 * parecem tratar do mesmo problema. Escolher uma vira apoio (2.7); nenhuma, pauta nova (2.6).
 *
 * A busca dá pontos por palavra do relato, não um `ts_rank` cru: um número que a equipe consegue
 * explicar e calibrar. Para cada palavra:
 *
 *   - 2 pontos se está no título (peso A do `pauta.busca`) ou é o título com erro de digitação;
 *   - 1 ponto se está só na descrição, ou é a descrição com erro de digitação;
 *   - 0 se não aparece.
 *
 * "Está" é pelo radical em português sem acento ("bebedouros" acha "bebedouro", "iluminacao" acha
 * "Iluminação"); o erro de digitação é pelo `pg_trgm` ("bibloteca" acha "Biblioteca"). O
 * `ts_rank` só desempata.
 *
 * Os limiares saíram dos relatos de `pautas-parecidas.test.ts`. Mudou um número? Rode aqueles
 * testes: são eles que dizem se o relato ainda encontra a pauta certa.
 */
import { and, blocos, eq, inArray, isNull, or, pautas, sql, type Db, type SQL } from '@lumens/db';

/** Quantas pautas o bot mostra, no máximo. A lista do WhatsApp ainda leva "É outro problema". */
export const LIMITE_PARECIDAS = 3;

/**
 * Pautas que ainda aceitam apoio ou estão sendo cobradas. As mesmas que o site trata como
 * abertas: em curadoria e recusada não são públicas, e as encerradas não recebem apoio novo.
 */
export const STATUS_ABERTOS = ['juntando_apoios', 'meta_batida', 'cobrando', 'prometido'] as const;

/**
 * Similaridade mínima (`word_similarity`, de 0 a 1) para uma palavra contar como o título ou a
 * descrição com erro de digitação. Com 0,5 "hora" já casava com "horário" e uma pauta errada
 * aparecia; com 0,6 "bibloteca" e "bebedor" ainda acham a pauta.
 */
export const SIMILARIDADE_MINIMA = 0.6;

/** Palavra curta demais dá trigrama em comum com tudo: só conta se aparecer inteira. */
const TAMANHO_MINIMO_APROXIMADO = 4;

/** Relato longo (mensagem encaminhada) não vira consulta com centenas de termos. */
const MAXIMO_DE_TERMOS = 12;

/**
 * Palavras que não distinguem uma pauta da outra. Já sem acento, porque quase ninguém acentua no
 * WhatsApp — e é por isso que a lista do próprio Postgres (acentuada) não basta. Inclui a escrita
 * de WhatsApp ("ta", "pra", "vc") e palavras que aparecem em qualquer relato do campus ("sala",
 * "aula", "bloco"): "a porta da sala 3" não é parecida com "Ar-condicionado nas salas".
 */
const PALAVRAS_IGNORADAS: ReadonlySet<string> = new Set(
  [
    // Português comum (lista do Snowball, sem acento).
    'a ao aos aquela aquelas aquele aqueles aquilo as ate com como da das de dela delas dele',
    'deles depois do dos e ela elas ele eles em entre era eram essa essas esse esses esta estas',
    'este estes eu foi fomos foram fosse fossem fui ha isso isto ja lhe lhes mais mas me mesmo meu',
    'meus minha minhas muito na nao nas nem no nos nossa nossas nosso nossos num numa o os ou para',
    'pela pelas pelo pelos por qual quando que quem se sem ser seu seus so sua suas tambem te tem',
    'tinha tu tua tuas teu teus um uma voce voces vos estao estava estavam estou estamos seja',
    'sejam sao sou somos tenho temos tiver tinham fica ficam',
    // Escrita de WhatsApp e muletas.
    'ta to tava pra pro pros pras q vc vcs tb tbm aqui ali la ai ainda agora hoje sempre nunca',
    'toda todo todos todas tudo nada nenhum nenhuma coisa coisas gente galera faz fazer favor',
    'ver vez hora horas dia dias semana semanas',
    // Comuns a qualquer relato do campus.
    'bloco blocos ufal campus universidade sala salas aula aulas curso problema problemas',
  ]
    .join(' ')
    .split(' '),
);

/** Minúsculas, sem acento: o mesmo que `normalizar_busca` faz no banco (menos o hífen). */
function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Palavras do texto, já sem acento. Hífen separa: "Wi-Fi" vira "wi" e "fi". */
export function palavrasDe(texto: string): string[] {
  return semAcento(texto).match(/[a-z0-9]+/g) ?? [];
}

/**
 * Os termos que vão para a busca: sem palavra comum, sem número ("sala 12", "bloco 18") e sem
 * repetição. `ignorar` tira as palavras do bloco já escolhido, que estão em toda pauta dele e
 * fariam qualquer relato parecer com todas.
 *
 * Sai só `[a-z0-9]`: é isso que deixa os termos entrarem no `to_tsquery` sem escapar nada.
 */
export function termosDaBusca(relato: string, ignorar: Iterable<string> = []): string[] {
  const fora = new Set(ignorar);
  const termos: string[] = [];
  for (const palavra of palavrasDe(relato)) {
    if (palavra.length < 2 || /^\d+$/.test(palavra)) continue;
    if (PALAVRAS_IGNORADAS.has(palavra) || fora.has(palavra) || termos.includes(palavra)) continue;
    termos.push(palavra);
    if (termos.length === MAXIMO_DE_TERMOS) break;
  }
  return termos;
}

export interface PautaParecida {
  id: string;
  slug: string;
  titulo: string;
  descricao: string;
  /** `null` = pauta do campus inteiro. */
  blocoId: string | null;
  /** Soma dos pontos das palavras do relato (veja o topo do arquivo). */
  pontos: number;
}

export interface BuscaDeParecidas {
  relato: string;
  /**
   * Bloco do problema. Com bloco, a busca fica nas pautas dele e nas do campus inteiro; `null`
   * (a pessoa não sabe, ou é do campus todo) procura em todas as pautas abertas.
   */
  blocoId: string | null;
}

const CONFIGURACAO = sql.raw(`'public.portugues_sem_acento'::regconfig`);
const LIMIAR = sql.raw(String(SIMILARIDADE_MINIMA));

function pontosDoTermo(termo: string): SQL {
  const noTitulo = sql`${pautas.busca} @@ to_tsquery(${CONFIGURACAO}, ${`${termo}:A`})`;
  const naPauta = sql`${pautas.busca} @@ to_tsquery(${CONFIGURACAO}, ${termo})`;
  if (termo.length < TAMANHO_MINIMO_APROXIMADO) {
    return sql`CASE WHEN ${noTitulo} THEN 2 WHEN ${naPauta} THEN 1 ELSE 0 END`;
  }
  const parecido = (coluna: typeof pautas.titulo | typeof pautas.descricao) =>
    sql`word_similarity(${termo}, "public"."normalizar_busca"(${coluna})) >= ${LIMIAR}`;
  return sql`CASE
    WHEN ${noTitulo} OR ${parecido(pautas.titulo)} THEN 2
    WHEN ${naPauta} OR ${parecido(pautas.descricao)} THEN 1
    ELSE 0 END`;
}

/**
 * Até `LIMITE_PARECIDAS` pautas abertas parecidas com o relato, da mais para a menos parecida.
 * Lista vazia quando nada passa do mínimo — aí o bot oferece pauta nova.
 *
 * Mínimo: 1 ponto, e pelo menos metade dos pontos da primeira. Uma pauta que só divide uma palavra
 * com o relato ainda aparece quando é o melhor que há (escolher "É outro problema" é barato; pauta
 * repetida custa apoio dividido), mas não aparece de enfeite ao lado de uma que casou de verdade.
 *
 * No empate, a pauta do bloco vem antes da do campus inteiro.
 */
export async function buscarPautasParecidas(
  db: Db,
  { relato, blocoId }: BuscaDeParecidas,
): Promise<PautaParecida[]> {
  let nomeDoBloco: string[] = [];
  if (blocoId !== null) {
    const [bloco] = await db
      .select({ nome: blocos.nome })
      .from(blocos)
      .where(eq(blocos.id, blocoId))
      .limit(1);
    nomeDoBloco = bloco ? palavrasDe(bloco.nome) : [];
  }

  const termos = termosDaBusca(relato, nomeDoBloco);
  if (termos.length === 0) return [];

  const pontos = sql<number>`(${sql.join(termos.map(pontosDoTermo), sql` + `)})`.mapWith(Number);
  const relevancia = sql`ts_rank(${pautas.busca}, to_tsquery(${CONFIGURACAO}, ${termos.join(' | ')}))`;

  const candidatas = await db
    .select({
      id: pautas.id,
      slug: pautas.slug,
      titulo: pautas.titulo,
      descricao: pautas.descricao,
      blocoId: pautas.blocoId,
      pontos,
    })
    .from(pautas)
    .where(
      and(
        inArray(pautas.status, [...STATUS_ABERTOS]),
        blocoId === null ? undefined : or(eq(pautas.blocoId, blocoId), isNull(pautas.blocoId)),
        sql`${pontos} > 0`,
      ),
    )
    .orderBy(
      sql`${pontos} DESC`,
      sql`${pautas.blocoId} IS NULL`,
      sql`${relevancia} DESC`,
      sql`${pautas.criadaEm} DESC`,
    )
    .limit(LIMITE_PARECIDAS);

  const melhor = candidatas[0]?.pontos ?? 0;
  return candidatas.filter((p) => p.pontos === melhor || p.pontos * 2 > melhor);
}

export interface BlocoParaRelato {
  id: string;
  slug: string;
  nome: string;
}

/** Blocos para a pessoa escolher onde é o problema, em ordem alfabética. */
export async function listarBlocos(db: Db): Promise<BlocoParaRelato[]> {
  return db
    .select({ id: blocos.id, slug: blocos.slug, nome: blocos.nome })
    .from(blocos)
    .orderBy(blocos.nome);
}
