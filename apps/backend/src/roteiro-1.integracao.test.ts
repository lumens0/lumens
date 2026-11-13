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
import { apoios, blocos, criarDb, criarPool, eq, estudantes, pautas, type Db } from '@lumens/db';
import { criarBancoTemporario } from '@lumens/db/teste';
import type { FastifyInstance } from 'fastify';
import type { PgBoss } from 'pg-boss';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import {
  ASK_ATTACH_REPORT_TEXT,
  cardDaPauta,
  SUPPORT_DONE_TEXT,
  supportedText,
} from './bot/conversation/apoio';
import { COOWNER_INVITE_TEXT } from './bot/conversation/co-owner';
import { estudanteVerificado } from './bot/conversation/estudante';
import { GREETING_TEXT, MENU_TEXT } from './bot/conversation/handlers';
import { PRIVACY_NOTICE_TEXT } from './bot/conversation/privacidade';
import { REPORT_PROMPT_TEXT } from './bot/conversation/relato';
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
import type { Chaves } from './cripto/cifra';
import type { ServicoDeEmail } from './email/codigo';
import { criarPgBossRuntime } from './infra/pg-boss';
import { filaPgBoss } from './infra/queue';

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
/** Conexão de administrador do banco temporário: só para montar a fixture e conferir no fim. */
let admin: Db;
let poolAdmin: ReturnType<typeof criarPool>;

/** A pauta que o relato vai encontrar, aberta para apoio, no Bloco 18. */
const PAUTA = {
  slug: 'bebedouros-no-bloco-18',
  titulo: 'Bebedouros funcionando no Bloco 18',
  descricao: 'Consertar os bebedouros quebrados do bloco e manter a manutenção em dia.',
  meta: 120,
};
let pautaId: string;

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
  poolAdmin = criarPool(banco.url, { conexaoMs: 5000, consultaMs: 15_000 }, () => undefined);
  admin = criarDb(poolAdmin);
  const [bloco] = await admin
    .insert(blocos)
    .values({ slug: 'bloco-18', nome: 'Bloco 18', baseEstudantes: 600 })
    .returning({ id: blocos.id });
  const [pauta] = await admin
    .insert(pautas)
    .values({
      ...PAUTA,
      blocoId: bloco?.id,
      categoria: 'infraestrutura',
      status: 'juntando_apoios',
      aprovadaEm: new Date(),
    })
    .returning({ id: pautas.id });
  if (pauta === undefined) throw new Error('fixture não criada');
  pautaId = pauta.id;
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
  await poolAdmin.end();
  await apagarBanco();
}, 30_000);

// Cada passo é uma ida e volta pela fila (webhook → worker → resposta): 5 s do padrão é justo demais.
describe.skipIf(!URL_TESTE || !URL_APLICACAO)(
  'roteiro 1: verificar e apoiar',
  { timeout: 30_000 },
  () => {
    it('primeiro contato recebe a saudação, o aviso de privacidade e o menu', async () => {
      expect(await texto('oi', 3)).toEqual([GREETING_TEXT, PRIVACY_NOTICE_TEXT, MENU_TEXT]);
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

    it('relata o problema, acha a pauta parecida e apoia (2.5 + 2.7)', async () => {
      expect(await texto('1', 1)).toEqual([REPORT_PROMPT_TEXT]);

      // O relato cita o bloco: o bot vai direto às pautas parecidas, sem perguntar o bloco.
      const [lista] = await texto('o bebedouro do bloco 18 está quebrado', 1);
      if (typeof lista !== 'object' || lista.tipo !== 'lista') {
        throw new Error('esperava a lista de pautas parecidas');
      }
      expect(lista.linhas.map((l) => l.id)).toContain(`pauta:${pautaId}`);

      // "É essa": o apoio conta na hora, com o placar.
      const aposEscolher = await mandar(
        buildListReply({ id: `pauta:${pautaId}`, title: PAUTA.titulo, from: TELEFONE }),
        3,
      );
      expect(aposEscolher).toEqual([
        supportedText(PAUTA.titulo, 1, PAUTA.meta),
        cardDaPauta(PAUTA.slug, 1),
        ASK_ATTACH_REPORT_TEXT,
      ]);

      // Fim do apoio: com vaga, o convite para cuidar da pauta (2.8) vem antes do menu.
      expect(await texto('não', 3)).toEqual([
        SUPPORT_DONE_TEXT,
        {
          tipo: 'botoes',
          corpo: COOWNER_INVITE_TEXT,
          botoes: [{ id: `cuidar ${pautaId}`, titulo: 'Quero cuidar' }],
        },
        MENU_TEXT,
      ]);
    });

    it('o apoio está no banco, ligado ao estudante verificado', async () => {
      const estudanteId = await estudanteVerificado(db, hashPhone(TELEFONE, chaves.hmac));
      const doApoio = await admin.select().from(apoios).where(eq(apoios.pautaId, pautaId));
      expect(doApoio).toHaveLength(1);
      expect(doApoio[0]).toMatchObject({ estudanteId, origem: 'bot' });
    });

    // O botão "Apoiar" do site manda `apoiar <slug>`, e quem interpreta o comando é a 2.8
    // (SCRUM-103, regex na SCRUM-153), que ainda não entrou. Quando entrar, este passo manda o
    // comando do botão e confere a contagem.
    it.todo('apoia uma pauta pelo comando do botão do site (2.8)');
  },
);
