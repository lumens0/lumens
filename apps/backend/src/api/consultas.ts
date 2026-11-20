import {
  SEMANAS_DE_APOIO,
  STATUS_PUBLICOS,
  type StatusPublico,
  type ApoioSemana,
  type ApoiosPorSemanaQuery,
  type AtividadeItem,
  type Bloco,
  type Caminho,
  type Conquista,
  type Evento,
  type PaginacaoQuery,
  type Pauta,
  type PautaDetalhe,
  type PautasQuery,
  type Relato,
  type Resumo,
} from '@lumens/contratos';
import { sql, type Db } from '@lumens/db';

type SQL = ReturnType<typeof sql>;

/**
 * Consultas da API de leitura pública (SCRUM-88). Só leem as views da T14: a conexão de leitura
 * (`lumens_site`) recebe `permission denied` em qualquer tabela.
 *
 * A normalização fica no SQL, para sair igual nos dois drivers: o node-postgres devolve
 * `timestamptz` como `Date` e pode deslocar um `date` pelo fuso local; o PGlite devolve texto.
 * Instantes saem como ISO 8601 em UTC (o formato do `toISOString()`), datas como `AAAA-MM-DD`
 * e contagens como `int`.
 */

/** `timestamptz` → `AAAA-MM-DDTHH:MM:SS.mmmZ`, ou nulo. */
function iso(coluna: string): SQL {
  return sql.raw(
    `to_char(${coluna} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ${coluna}`,
  );
}

async function linhas<T>(db: Db, consulta: SQL): Promise<T[]> {
  const resultado: unknown = await db.execute(consulta);
  return (resultado as { rows: T[] }).rows;
}

/** Busca uma linha a mais que o `limit` para saber se existe página seguinte. */
function paginar<T>(itens: T[], { limit, offset }: PaginacaoQuery) {
  return {
    itens: itens.slice(0, limit),
    proximo: itens.length > limit ? offset + limit : null,
  };
}

export async function buscarResumo(db: Db): Promise<Resumo> {
  const [linha] = await linhas<Resumo>(
    db,
    sql`SELECT pautas_abertas::int AS pautas_abertas, apoios::int AS apoios,
               conquistas::int AS conquistas
        FROM v_resumo`,
  );
  // A view agrega sem GROUP BY: sempre devolve uma linha, mesmo com o banco vazio.
  return linha ?? { pautas_abertas: 0, apoios: 0, conquistas: 0 };
}

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/** Segunda-feira (UTC) das últimas `quantidade` semanas, da mais antiga à atual, como `AAAA-MM-DD`. */
export function ultimasSemanas(agora: Date, quantidade: number): string[] {
  const hoje = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
  // getUTCDay: domingo = 0. Volta até a segunda-feira (domingo volta seis dias).
  const segunda = hoje - ((agora.getUTCDay() + 6) % 7) * DIA_EM_MS;
  return Array.from({ length: quantidade }, (_, i) =>
    new Date(segunda - (quantidade - 1 - i) * 7 * DIA_EM_MS).toISOString().slice(0, 10),
  );
}

/**
 * Apoios por semana nas últimas oito, com zero nas semanas sem apoio (o gráfico não tem buracos).
 * Reflete os apoios que existem hoje: quem sai do Lumens perde o apoio e some da contagem.
 */
export async function listarApoiosPorSemana(
  db: Db,
  query: ApoiosPorSemanaQuery,
  agora: Date = new Date(),
): Promise<ApoioSemana[]> {
  const semanas = ultimasSemanas(agora, SEMANAS_DE_APOIO);
  const filtro = query.bloco === undefined ? sql`` : sql`AND bloco_slug = ${query.bloco}`;
  const encontradas = await linhas<ApoioSemana>(
    db,
    sql`SELECT to_char(semana, 'YYYY-MM-DD') AS semana, sum(apoios)::int AS apoios
        FROM v_apoio_semana
        WHERE semana >= ${semanas[0]}::date AND semana <= ${semanas[semanas.length - 1]}::date ${filtro}
        GROUP BY semana`,
  );
  const porSemana = new Map(encontradas.map((l) => [l.semana, l.apoios]));
  return semanas.map((semana) => ({ semana, apoios: porSemana.get(semana) ?? 0 }));
}

export async function listarBlocos(db: Db): Promise<Bloco[]> {
  return linhas<Bloco>(
    db,
    sql`SELECT slug, nome, base_estudantes::int AS base_estudantes
        FROM v_bloco ORDER BY nome, slug`,
  );
}

const COLUNAS_PAUTA = sql.join(
  [
    sql.raw('slug, titulo, descricao, categoria, status::text AS status'),
    sql.raw('meta::int AS meta, apoios::int AS apoios, bloco_slug, bloco_nome'),
    sql.raw('urgente'),
    sql.raw('cursos_responsaveis'),
    iso('criada_em'),
    iso('aprovada_em'),
    iso('meta_batida_em'),
    sql.raw('proxima_etapa'),
  ],
  sql.raw(', '),
);

/** Texto sem acento e em minúsculas, igual ao `semAcento` do site. */
export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * O mesmo, em SQL, com a mesma transformação do JS: decompõe (NFD), tira as marcas combinantes
 * (U+0300 a U+036F) e põe em minúsculas. Vale para texto gravado composto ou decomposto.
 * `normalize()` pede Postgres 13+ e banco UTF-8 (produção é 17; o PGlite dos testes é 16+).
 */
function semAcentoSql(coluna: string): SQL {
  return sql.raw(`lower(regexp_replace(normalize(${coluna}, NFD), '[\\u0300-\\u036f]', '', 'g'))`);
}

/** Etapa como o site mostra (StatusPill), para a busca achar "cobrando" ou "meta batida". */
const ROTULO_DA_ETAPA: Record<StatusPublico, string> = {
  juntando_apoios: 'Juntando apoios',
  meta_batida: 'Meta batida',
  cobrando: 'Cobrando',
  prometido: 'Prometido',
  entregue_em_parte: 'Entregue em parte',
  descumprida: 'Descumprida',
  conquistada: 'Conquistada',
};

/** Do que mais pede atenção ao que menos, depois do urgente (igual ao site). */
const PRIORIDADE: readonly StatusPublico[] = [
  'descumprida',
  'cobrando',
  'prometido',
  'meta_batida',
  'entregue_em_parte',
  'juntando_apoios',
  'conquistada',
];

const lista = (valores: readonly string[]): SQL =>
  sql.join(
    valores.map((v) => sql`${v}`),
    sql.raw(', '),
  );

/**
 * "Ou" dentro de cada grupo (blocos, etapas), "e" entre os grupos e entre as palavras da busca.
 * Cada palavra tem de aparecer no título, no nome do bloco ou na etapa, sem acento e sem
 * diferenciar maiúsculas; a palavra "urgente" acha as pautas urgentes. A sigla do bloco não entra:
 * ela mora só no mapa do site (`predios.ts`), e o site manda o slug do bloco que ela identifica.
 */
function condicoes({ bloco, status, q }: PautasQuery): SQL {
  const partes: SQL[] = [];
  if (bloco.length > 0) partes.push(sql`bloco_slug IN (${lista(bloco)})`);
  if (status.length > 0) partes.push(sql`status::text IN (${lista(status)})`);
  const palavras = semAcento(q ?? '')
    .split(/\s+/)
    .filter(Boolean);
  for (const palavra of palavras) {
    if (palavra === 'urgente') {
      partes.push(sql`urgente`);
      continue;
    }
    const etapas = STATUS_PUBLICOS.filter((e) => semAcento(ROTULO_DA_ETAPA[e]).includes(palavra));
    const casamentos = [
      sql`strpos(${semAcentoSql('titulo')}, ${palavra}) > 0`,
      sql`strpos(${semAcentoSql("coalesce(bloco_nome, '')")}, ${palavra}) > 0`,
      ...(etapas.length > 0 ? [sql`status::text IN (${lista(etapas)})`] : []),
    ];
    partes.push(sql`(${sql.join(casamentos, sql` OR `)})`);
  }
  return partes.length === 0 ? sql`` : sql`WHERE ${sql.join(partes, sql` AND `)}`;
}

/** Posição da etapa em `PRIORIDADE`, para o `ORDER BY`. */
const PESO_DA_ETAPA = sql.raw(
  `CASE v_pauta_publica.status::text ${PRIORIDADE.map((e, i) => `WHEN '${e}' THEN ${String(i)}`).join(' ')} ELSE ${String(PRIORIDADE.length)} END`,
);
// O título desempata sem acento (como o `localeCompare` do site) e o slug fecha a ordem.
const TITULO_ORDENADO = semAcentoSql('v_pauta_publica.titulo');

function ordenacao(ordem: PautasQuery['ordem']): SQL {
  switch (ordem) {
    case 'atencao':
      return sql`v_pauta_publica.urgente DESC, ${PESO_DA_ETAPA}, v_pauta_publica.apoios DESC,
                 ${TITULO_ORDENADO}, slug`;
    case 'apoios':
      return sql`v_pauta_publica.apoios DESC, ${TITULO_ORDENADO}, slug`;
    case 'recentes':
      return sql`v_pauta_publica.criada_em DESC, ${TITULO_ORDENADO}, slug`;
    case undefined:
      // Padrão de antes da busca e da ordem: o que o site chamava até aqui.
      return sql`v_pauta_publica.urgente DESC, v_pauta_publica.apoios DESC,
                 v_pauta_publica.criada_em DESC, slug`;
  }
}

/** Filtra, busca, ordena e pagina as pautas públicas; `total` ignora `limit` e `offset`. */
export async function listarPautas(db: Db, query: PautasQuery) {
  const filtro = condicoes(query);
  const [itens, [contagem]] = await Promise.all([
    linhas<Pauta>(
      db,
      sql`SELECT ${COLUNAS_PAUTA} FROM v_pauta_publica ${filtro}
          ORDER BY ${ordenacao(query.ordem)}
          LIMIT ${query.limit + 1} OFFSET ${query.offset}`,
    ),
    linhas<{ total: number }>(
      db,
      sql`SELECT count(*)::int AS total FROM v_pauta_publica ${filtro}`,
    ),
  ]);
  return { ...paginar(itens, query), total: contagem?.total ?? 0 };
}

/** Nulo quando a pauta não existe ou não é pública: as views não distinguem os dois casos. */
export async function buscarPauta(db: Db, slug: string): Promise<PautaDetalhe | null> {
  const [pautas, relatos, caminhos, linhaDoTempo] = await Promise.all([
    linhas<Pauta>(db, sql`SELECT ${COLUNAS_PAUTA} FROM v_pauta_publica WHERE slug = ${slug}`),
    linhas<Relato>(
      db,
      sql`SELECT texto, fotos, curso, ${iso('moderado_em')}
          FROM v_relato_publico WHERE pauta_slug = ${slug}
          ORDER BY v_relato_publico.moderado_em`,
    ),
    linhas<Caminho>(
      db,
      // `to_char` e não `::text`: o cast segue o `DateStyle` da sessão (ex.: `20/03/2026`).
      sql`SELECT tipo, status, protocolo, to_char(prazo, 'YYYY-MM-DD') AS prazo, prorrogado, ${iso('aberto_em')}, descricao,
                 pessoas_necessarias::int AS pessoas_necessarias, voluntarios::int AS voluntarios,
                 ${iso('executada_em')}
          FROM v_caminho_publico WHERE pauta_slug = ${slug}
          ORDER BY v_caminho_publico.aberto_em NULLS LAST, tipo`,
    ),
    linhas<Evento>(
      db,
      sql`SELECT tipo, dados, ${iso('criado_em')}
          FROM v_linha_do_tempo WHERE pauta_slug = ${slug}
          -- A view não expõe a ordem de inserção: eventos do mesmo instante (aprovar e marcar
          -- urgente na mesma transação) desempatam pelo tipo, sempre na mesma ordem.
          ORDER BY v_linha_do_tempo.criado_em, tipo`,
    ),
  ]);
  const [pauta] = pautas;
  if (!pauta) return null;
  return { ...pauta, relatos, caminhos, linha_do_tempo: linhaDoTempo };
}

export async function listarConquistas(db: Db): Promise<Conquista[]> {
  return linhas<Conquista>(
    db,
    sql`SELECT pauta_slug, titulo, bloco_nome, ${iso('conquistada_em')},
               apoios::int AS apoios, proposta_executada, ${iso('criada_em')}
        FROM v_conquista ORDER BY v_conquista.conquistada_em DESC NULLS LAST, pauta_slug`,
  );
}

/**
 * `criado_em DESC` vem na frente porque é a ordem do índice parcial da T14. O desempate
 * (`pauta_slug`, `tipo`, `dados`) deixa a ordem estável entre páginas quando dois eventos têm o
 * mesmo instante: sem ele, o OFFSET podia repetir um evento e pular outro. O Postgres o aplica
 * como `Incremental Sort` sobre a ordem do índice, sem ordenar o feed inteiro.
 */
export async function listarAtividade(db: Db, query: PaginacaoQuery) {
  const itens = await linhas<AtividadeItem>(
    db,
    sql`SELECT pauta_slug, pauta_titulo, tipo, dados, ${iso('criado_em')}
        FROM v_atividade
        ORDER BY v_atividade.criado_em DESC, pauta_slug, tipo, v_atividade.dados
        LIMIT ${query.limit + 1} OFFSET ${query.offset}`,
  );
  return paginar(itens, query);
}

/** Se a chave é foto aprovada de um relato aprovado de pauta pública (`v_foto_publica`). */
export async function fotoEhPublica(db: Db, chave: string): Promise<boolean> {
  const achadas = await linhas<{ ok: number }>(
    db,
    sql`SELECT 1 AS ok FROM v_foto_publica WHERE chave = ${chave} LIMIT 1`,
  );
  return achadas.length > 0;
}
