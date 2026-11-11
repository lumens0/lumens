import { criarDb, criarPool, estudantes, type Db } from '@lumens/db';
import { criarBancoTemporario } from '@lumens/db/teste';
import type { PgBoss } from 'pg-boss';
import { pino } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { cifrar, type Chaves } from '../cripto';
import { criarPgBossRuntime } from '../pg-boss';
import { filaPgBoss, JOBS } from '../queue';
import { ConversationStore } from './conversation/store';
import { FILAS_COM_TELEFONE } from './filas-do-telefone';
import type { IncomingMessageJob } from './webhook/process';
import { registerIncomingWorker } from './worker';

/**
 * `sair` tira o telefone das filas do bot (SCRUM-174), com Postgres e pg-boss de verdade: é o
 * pg-boss que guarda os jobs, e o PGlite não tem o schema dele.
 */
const URL_TESTE = process.env.DATABASE_URL_TESTE;
const URL_APLICACAO = process.env.DATABASE_URL;
if (!URL_TESTE && process.env.CI) throw new Error('No CI, defina DATABASE_URL_TESTE.');
if (!URL_APLICACAO && process.env.CI) throw new Error('No CI, defina DATABASE_URL.');

const chaves: Chaves = { cifra: Buffer.alloc(32, 5), hmac: Buffer.alloc(32, 6) };
const QUEM_SAI = 'a'.repeat(64);
const OUTRA_PESSOA = 'b'.repeat(64);

let contador = 0;
function mensagem(phoneHmac: string, texto: string): IncomingMessageJob {
  contador++;
  return {
    wamidHmac: `w${String(contador)}`,
    wamidCifrado: 'x',
    phoneHmac,
    phoneCifrado: 'telefone-cifrado',
    phoneNumberId: 'PNID',
    type: 'text',
    timestamp: '1700000000',
    contentCifrado: cifrar(JSON.stringify({ text: { body: texto } }), chaves.cifra),
  };
}

interface Job {
  name: string;
  state: string;
  deletion_seconds: number;
}

let ambiente: {
  db: Db;
  pool: ReturnType<typeof criarPool>;
  boss: PgBoss;
  apagar: () => Promise<void>;
};

afterEach(async () => {
  await ambiente.boss.stop({ graceful: false });
  await ambiente.pool.end();
  await ambiente.apagar();
}, 30_000);

async function montar() {
  if (!URL_TESTE || !URL_APLICACAO) throw new Error('sem banco');
  const banco = await criarBancoTemporario(URL_TESTE);
  const url = new URL(banco.url);
  const credenciais = new URL(URL_APLICACAO);
  url.username = credenciais.username;
  url.password = credenciais.password;
  const pool = criarPool(url.toString(), { conexaoMs: 5000, consultaMs: 15_000 }, () => undefined);
  const db = criarDb(pool);
  const boss = criarPgBossRuntime(url.toString(), { supervise: false, schedule: false });
  boss.on('error', () => undefined);
  await boss.start();
  // Sem worker de resposta: as respostas ficam na fila, como ficariam esperando o envio.
  await boss.createQueue(JOBS.outgoingReplies);
  await registerIncomingWorker(boss, {
    db,
    store: new ConversationStore(db),
    queue: filaPgBoss(boss),
    logger: pino({ level: 'silent' }),
    chaves,
  });
  ambiente = { db, pool, boss, apagar: banco.apagar };
  return ambiente;
}

const jobsDe = async (pool: ReturnType<typeof criarPool>, phoneHmac: string) =>
  (
    await pool.query<Job>(
      `SELECT name, state, deletion_seconds FROM pgboss.job
       WHERE name = ANY($1) AND data->>'phoneHmac' = $2 ORDER BY created_on`,
      [[...FILAS_COM_TELEFONE], phoneHmac],
    )
  ).rows;

/** Manda uma mensagem e espera o worker concluí-la. */
async function mandar(db: Db, boss: PgBoss, phoneHmac: string, texto: string) {
  const fila = filaPgBoss(boss);
  const id = await db.transaction((tx) =>
    fila.send(JOBS.incomingMessage, mensagem(phoneHmac, texto), tx, { chave: phoneHmac }),
  );
  const fim = Date.now() + 20_000;
  for (;;) {
    const [job] = (
      await ambiente.pool.query<{ state: string }>('SELECT state FROM pgboss.job WHERE id = $1', [
        id,
      ])
    ).rows;
    if (job?.state === 'completed' || job === undefined) return;
    if (Date.now() > fim) throw new Error(`a mensagem "${texto}" não foi processada`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe.skipIf(!URL_TESTE || !URL_APLICACAO)('sair apaga o telefone das filas (SCRUM-174)', () => {
  it('apaga as mensagens e respostas antigas; o que falta terminar sai logo depois', async () => {
    const { db, boss } = await montar();
    await db.insert(estudantes).values({
      telefoneHmac: QUEM_SAI,
      telefoneCifrado: 'x',
      curso: 'Direito',
      verificadoEm: new Date(),
    });

    await mandar(db, boss, QUEM_SAI, 'oi');
    await mandar(db, boss, OUTRA_PESSOA, 'oi');
    await mandar(db, boss, QUEM_SAI, '1');
    await mandar(db, boss, QUEM_SAI, 'sair');
    // Antes do "sim": 3 mensagens e 3 respostas de quem vai sair.
    expect(await jobsDe(ambiente.pool, QUEM_SAI)).toHaveLength(6);

    await mandar(db, boss, QUEM_SAI, 'sim');

    // Sobram só a mensagem "sim" e a resposta de saída, marcadas para sumir 1 s depois de concluídas.
    const restantes = await jobsDe(ambiente.pool, QUEM_SAI);
    expect(restantes.map((j) => j.name).sort()).toEqual(
      [JOBS.incomingMessage, JOBS.outgoingReplies].sort(),
    );
    expect(restantes.every((j) => j.deletion_seconds === 1)).toBe(true);

    // Quem não saiu não perde nada, e mantém a retenção padrão.
    const daOutra = await jobsDe(ambiente.pool, OUTRA_PESSOA);
    expect(daOutra).toHaveLength(2);
    expect(daOutra.every((j) => j.deletion_seconds > 1)).toBe(true);
  }, 60_000);

  it('sem cadastro, o sair também apaga o que ficou nas filas', async () => {
    const { db, boss } = await montar();
    await mandar(db, boss, QUEM_SAI, 'oi');
    await mandar(db, boss, QUEM_SAI, 'sair');

    const restantes = await jobsDe(ambiente.pool, QUEM_SAI);
    expect(restantes.map((j) => j.name).sort()).toEqual(
      [JOBS.incomingMessage, JOBS.outgoingReplies].sort(),
    );
    expect(restantes.every((j) => j.deletion_seconds === 1)).toBe(true);
  }, 60_000);
});
