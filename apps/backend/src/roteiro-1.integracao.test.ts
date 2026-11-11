/**
 * Roteiro 1 de ponta a ponta (SCRUM-116 / SCRUM-177): uma estudante chega pelo WhatsApp, se
 * verifica com o e-mail da UFAL e apoia uma pauta.
 *
 * Nada é chamado por dentro: o simulador de webhook (2.2) monta e assina o payload da Meta, o
 * Fastify recebe no POST /webhook, o pg-boss de verdade leva a mensagem ao worker, os handlers
 * padrão respondem e as respostas saem pela fila de saída. Banco Postgres temporário, com o login
 * restrito da aplicação (`lumens_app`), como em produção.
 *
 * Roda no `pnpm test` do CI (SCRUM-178), que já tem o Postgres e as URLs do banco.
 */
import { criarDb, criarPool, estudantes, type Db } from '@lumens/db';
import { criarBancoTemporario } from '@lumens/db/teste';
import type { FastifyInstance } from 'fastify';
import type { PgBoss } from 'pg-boss';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { estudanteVerificado } from './bot/conversation/estudante';
import { GREETING_TEXT, MENU_TEXT } from './bot/conversation/handlers';
import { hashPhone } from './bot/conversation/phone';
import type { Resposta } from './bot/conversation/resposta';
import { ConversationStore } from './bot/conversation/store';
import {
  CODE_OK_TEXT,
  CODE_SENT_TEXT,
  EMAIL_QUESTION_TEXT,
  VERIFIED_TEXT,
} from './bot/conversation/verificacao';
import { buildListReply, buildTextMessage } from './bot/sim/payloads';
import { signPayload } from './bot/sim/send';
import { registerIncomingWorker, registerReplyWorker, respostasDoJob } from './bot/worker';
import type { Chaves } from './cripto';
import type { ServicoDeEmail } from './email/codigo';
import { criarPgBossRuntime } from './pg-boss';
import { filaPgBoss } from './queue';

const URL_TESTE = process.env.DATABASE_URL_TESTE;
const URL_APLICACAO = process.env.DATABASE_URL;
if (!URL_TESTE && process.env.CI) throw new Error('No CI, defina DATABASE_URL_TESTE.');
if (!URL_APLICACAO && process.env.CI) throw new Error('No CI, defina DATABASE_URL.');

const SEGREDO_DA_META = 'segredo-do-roteiro-1';
const TELEFONE = '5582988887777';
const EMAIL = 'estudante.roteiro@ufal.br';
const chaves: Chaves = { cifra: Buffer.alloc(32, 3), hmac: Buffer.alloc(32, 4) };
const logger = pino({ level: 'silent' });

let db: Db;
let pool: ReturnType<typeof criarPool>;
let boss: PgBoss;
let app: FastifyInstance;
let apagarBanco: () => Promise<void>;

/** O que o bot mandou, na ordem em que saiu da fila. */
const enviadas: Resposta[] = [];
/** Último código "enviado" por e-mail. */
let codigo: string | undefined;
const email: ServicoDeEmail = {
  enviarCodigo(para, novo) {
    expect(para).toBe(EMAIL);
    codigo = novo;
    return Promise.resolve(true);
  },
};

async function esperarAte(condicao: () => boolean, limiteMs = 20_000) {
  const fim = Date.now() + limiteMs;
  while (!condicao()) {
    if (Date.now() > fim) throw new Error('tempo esgotado esperando a resposta do bot');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Manda pelo webhook, como a Meta faria, e espera as `n` respostas que a mensagem gera. */
async function mandar(payload: unknown, n: number): Promise<Resposta[]> {
  const antes = enviadas.length;
  const { body, signature } = signPayload(payload, SEGREDO_DA_META);
  const resposta = await app.inject({
    method: 'POST',
    url: '/webhook',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    payload: body,
  });
  expect(resposta.statusCode).toBe(200);
  await esperarAte(() => enviadas.length >= antes + n);
  return enviadas.slice(antes);
}

const texto = (body: string, n: number) => mandar(buildTextMessage({ body, from: TELEFONE }), n);

beforeAll(async () => {
  if (!URL_TESTE || !URL_APLICACAO) return;
  const banco = await criarBancoTemporario(URL_TESTE);
  apagarBanco = banco.apagar;
  const url = new URL(banco.url);
  const credenciais = new URL(URL_APLICACAO);
  url.username = credenciais.username;
  url.password = credenciais.password;
  pool = criarPool(url.toString(), { conexaoMs: 5000, consultaMs: 15_000 }, () => undefined);
  db = criarDb(pool);

  boss = criarPgBossRuntime(url.toString(), { supervise: false, schedule: false });
  boss.on('error', () => undefined);
  await boss.start();
  const queue = filaPgBoss(boss);
  await registerIncomingWorker(boss, {
    db,
    store: new ConversationStore(db),
    queue,
    logger,
    chaves,
    email,
  });
  await registerReplyWorker(
    boss,
    {
      send: (mensagem) => {
        enviadas.push(...respostasDoJob(mensagem, chaves));
        return Promise.resolve();
      },
    },
    logger,
  );
  app = await buildApp({
    config: { verifyToken: 'token', appSecret: SEGREDO_DA_META },
    db,
    queue,
    logger,
    chaves,
    leitura: { db, origensCors: [] },
  });
}, 60_000);

afterAll(async () => {
  if (!URL_TESTE || !URL_APLICACAO) return;
  await app.close();
  await boss.stop({ graceful: false });
  await pool.end();
  await apagarBanco();
}, 30_000);

describe.skipIf(!URL_TESTE || !URL_APLICACAO)('roteiro 1: verificar e apoiar', () => {
  it('primeiro contato recebe a saudação e o menu', async () => {
    const respostas = await texto('oi', 2);
    expect(respostas[0]).toBe(GREETING_TEXT);
    expect(respostas.at(-1)).toBe(MENU_TEXT);
  });

  it('verifica com o e-mail da UFAL, o código e o curso', async () => {
    expect(await texto('3', 1)).toEqual([EMAIL_QUESTION_TEXT]);
    expect(await texto(EMAIL, 1)).toEqual([CODE_SENT_TEXT]);
    expect(codigo).toMatch(/^\d+$/);

    const aposCodigo = await texto(codigo ?? '', 2);
    expect(aposCodigo[0]).toBe(CODE_OK_TEXT);

    const aposCurso = await mandar(
      buildListReply({ id: 'curso:Direito', title: 'Direito', from: TELEFONE }),
      1,
    );
    expect(aposCurso[0]).toBe(VERIFIED_TEXT);
  });

  it('o cadastro fica verificado, sem telefone nem e-mail em claro', async () => {
    expect(await estudanteVerificado(db, hashPhone(TELEFONE, chaves.hmac))).toBeDefined();
    const [linha] = await db.select().from(estudantes);
    expect(linha).toMatchObject({ curso: 'Direito', saiuEm: null });
    expect(JSON.stringify(linha)).not.toContain(TELEFONE);
    expect(JSON.stringify(linha)).not.toContain(EMAIL);
  });

  // Depende do apoio pelo bot (2.7, SCRUM-102): hoje o bot não interpreta `apoiar <slug>`.
  // Quando a 2.7 entrar, este passo manda o comando do botão do site e confere a contagem.
  it.todo('apoia uma pauta pelo comando do site e o apoio entra na contagem');
});
