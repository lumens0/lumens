import {
  apoiosPorSemana,
  apoiosPorSemanaQuery,
  atividade,
  blocos,
  conquistas,
  erro,
  paginacaoQuery,
  pautaDetalhe,
  pautaParams,
  pautas,
  pautasQuery,
  resumo,
} from '@lumens/contratos';
import type { Db } from '@lumens/db';
import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { LerArquivo } from '../fotos/storage';
import { MUITAS_REQUISICOES } from '../infra/limite';
import { resumoDoErro } from '../infra/logger';
import {
  buscarPauta,
  fotoEhPublica,
  buscarResumo,
  listarApoiosPorSemana,
  listarAtividade,
  listarBlocos,
  listarConquistas,
  listarPautas,
} from './consultas';

export interface ApiPluginOptions {
  /** Conexão de leitura (`lumens_site`): só enxerga as views públicas. */
  db: Db;
  /** Origens do site que podem ler a API pelo navegador (CORS). */
  origensCors: readonly string[];
  /** Lê um arquivo do storage das fotos. Sem ele, `/fotos` responde 404 para tudo. */
  lerFoto?: LerArquivo;
}

export const CACHE_PUBLICO = 'public, max-age=10, stale-while-revalidate=10';
const FOTO_NAO_ENCONTRADA = { erro: 'Foto não encontrada.' };
const CHAVE_DE_FOTO = /^fotos\/\d{4}\/\d{2}\/[A-Za-z0-9_-]+\.[a-z0-9]{1,5}$/;
const TIPOS_DE_IMAGEM = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PAUTA_NAO_ENCONTRADA = { erro: 'Pauta não encontrada.' };

/**
 * JSON Schema de resposta a partir do contrato zod. O Fastify serializa com ele, então campo
 * que não está no contrato (uma coluna nova numa view, por exemplo) não sai na resposta.
 * Draft-07 porque é o que o ajv e o fast-json-stringify do Fastify usam.
 */
function esquemaDeResposta(esquema: z.ZodType) {
  const { $schema: _, ...json } = z.toJSONSchema(esquema, { target: 'draft-7', io: 'output' });
  return json;
}

const ERRO = esquemaDeResposta(erro);

function respostas(sucesso: z.ZodType) {
  return { response: { 200: esquemaDeResposta(sucesso), 400: ERRO, 404: ERRO } };
}

/**
 * Valida query ou params com o contrato. Parâmetro repetido (`?limit=1&limit=2`) chega como
 * lista e é recusado: o `z.coerce` transformaria `['5']` em 5 sem reclamar.
 */
function validar<T extends z.ZodType>(
  esquema: T,
  entrada: unknown,
  reply: FastifyReply,
): z.infer<T> | undefined {
  const valores = (entrada ?? {}) as Record<string, unknown>;
  const repetidos = Object.keys(valores).filter((chave) => Array.isArray(valores[chave]));
  const resultado = esquema.safeParse(valores);
  const invalidos = new Set([
    ...repetidos,
    ...(resultado.error?.issues.map((problema) => String(problema.path[0])) ?? []),
  ]);
  if (invalidos.size > 0 || !resultado.success) {
    void reply.code(400).send({ erro: `Parâmetro inválido: ${[...invalidos].join(', ')}.` });
    return undefined;
  }
  return resultado.data;
}

/**
 * API de leitura pública (SCRUM-88): só GET, sem login, só nas views da T14.
 *
 * Plugin encapsulado (sem fastify-plugin): os hooks de CORS e de cache e o tratador de erro
 * valem só para estas rotas, não para o webhook.
 */
export const apiPlugin: FastifyPluginCallback<ApiPluginOptions> = (app, opts, done) => {
  const { db } = opts;
  const origens = new Set(opts.origensCors);

  app.addHook('onSend', async (req, reply) => {
    const origem = req.headers.origin;
    // Nunca `*`: só a origem do site, ecoada. O `Vary` vale sempre, para um cache
    // compartilhado não servir a resposta de uma origem para outra.
    if (typeof origem === 'string' && origens.has(origem)) {
      void reply.header('Access-Control-Allow-Origin', origem);
    }
    void reply.header('Vary', 'Origin');
    void reply.header('Cache-Control', reply.statusCode === 200 ? CACHE_PUBLICO : 'no-store');
  });

  // A mensagem padrão do Fastify repassaria o texto do erro do banco ao cliente.
  app.setErrorHandler((err, req, reply) => {
    // O 429 do limite de requisições (SCRUM-310) é resposta, não falha: vai como veio, com o
    // Retry-After que o limitador já pôs.
    if ((err as { statusCode?: number }).statusCode === 429) {
      void reply.code(429).send({ erro: MUITAS_REQUISICOES });
      return;
    }
    req.log.error({ erro: resumoDoErro(err) }, 'falha na API de leitura');
    void reply.code(500).send({ erro: 'Erro interno.' });
  });

  app.get('/resumo', { schema: respostas(resumo) }, () => buscarResumo(db));

  app.get('/blocos', { schema: respostas(blocos) }, async () => ({
    itens: await listarBlocos(db),
  }));

  // Só números agregados da view `v_apoio_semana`. A contagem reflete os apoios que existem hoje:
  // quem sai do Lumens perde o apoio, então uma semana passada pode ficar menor depois.
  app.get('/apoios-por-semana', { schema: respostas(apoiosPorSemana) }, async (req, reply) => {
    const query = validar(apoiosPorSemanaQuery, req.query, reply);
    if (!query) return reply;
    return { itens: await listarApoiosPorSemana(db, query) };
  });

  app.get('/pautas', { schema: respostas(pautas) }, async (req, reply) => {
    const query = validar(pautasQuery, req.query, reply);
    if (!query) return reply;
    return listarPautas(db, query);
  });

  app.get('/pautas/:slug', { schema: respostas(pautaDetalhe) }, async (req, reply) => {
    const params = validar(pautaParams, req.params, reply);
    if (!params) return reply;
    const pauta = await buscarPauta(db, params.slug);
    // Mesmo corpo para pauta inexistente e escondida: o 404 não confirma que ela existe.
    if (!pauta) return reply.code(404).send(PAUTA_NAO_ENCONTRADA);
    return pauta;
  });

  app.get('/conquistas', { schema: respostas(conquistas) }, async () => ({
    itens: await listarConquistas(db),
  }));

  app.get('/atividade', { schema: respostas(atividade) }, async (req, reply) => {
    const query = validar(paginacaoQuery, req.query, reply);
    if (!query) return reply;
    return listarAtividade(db, query);
  });

  // Só a foto de relato aprovado (`v_relato_publico`) ou a da conquista, com a pauta conquistada
  // (SCRUM-394): a chave de relato pendente ou recusado, de conquista que deixou de ser conquistada
  // ou de qualquer outro arquivo do bucket (PDF da resposta, por exemplo), responde 404 igual
  // (SCRUM-263). A chave gravada é `fotos/AAAA/MM/<uuid>.<ext>`.
  app.get('/fotos/:ano/:mes/:arquivo', async (req, reply) => {
    const { ano, mes, arquivo: nome } = req.params as Record<'ano' | 'mes' | 'arquivo', string>;
    const chave = `fotos/${ano}/${mes}/${nome}`;
    if (!opts.lerFoto || !CHAVE_DE_FOTO.test(chave)) {
      return reply.code(404).send(FOTO_NAO_ENCONTRADA);
    }
    const arquivo = (await fotoEhPublica(db, chave)) ? await opts.lerFoto(chave) : null;
    if (!arquivo) return reply.code(404).send(FOTO_NAO_ENCONTRADA);
    const tipo = TIPOS_DE_IMAGEM.has(arquivo.contentType ?? '')
      ? (arquivo.contentType as string)
      : 'application/octet-stream';
    return reply
      .header('Content-Type', tipo)
      .header('X-Content-Type-Options', 'nosniff')
      .send(arquivo.bytes);
  });

  done();
};
