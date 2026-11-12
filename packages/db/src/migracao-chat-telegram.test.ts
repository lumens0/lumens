import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PASTA = fileURLToPath(new URL('../migrations', import.meta.url));
const TAG = '0014_chat_telegram';

interface Journal {
  entries: { idx: number; tag: string }[];
}

let banco: { url: string; apagar: () => Promise<void> } | undefined;
let pool: Pool;
let antes: string;

/**
 * Upgrade da 0014 num banco que já tem estudantes e disparos: aplica as migrações até a 0013,
 * grava dados como os de produção e só então aplica a 0014, como o `db:migrate` faria no deploy.
 */
beforeAll(async () => {
  const origem = process.env.DATABASE_URL_TESTE;
  if (!origem) throw new Error('Defina DATABASE_URL_TESTE e suba o Postgres com pnpm db:up.');
  if (!new URL(origem).pathname.endsWith('_test')) {
    throw new Error('DATABASE_URL_TESTE deve apontar para um banco terminado em _test.');
  }
  // Um banco novo e vazio: o `criarBancoTemporario` migraria tudo de uma vez.
  const admin = new Pool({ connectionString: origem, connectionTimeoutMillis: 5000 });
  const nome = `lumens_test_tmp_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE "${nome}"`);
  const destino = new URL(origem);
  destino.pathname = `/${nome}`;
  banco = {
    url: destino.toString(),
    apagar: async () => {
      try {
        await admin.query(`DROP DATABASE "${nome}" WITH (FORCE)`);
      } finally {
        await admin.end();
      }
    },
  };
  pool = new Pool({ connectionString: banco.url, connectionTimeoutMillis: 5000 });
  // Os papéis da 0003 existem no cluster (db:provision), e o Postgres os compartilha entre bancos.

  // Cópia da pasta com o journal só até a migração anterior à 0014.
  antes = await mkdtemp(join(tmpdir(), 'lumens-migracoes-'));
  await cp(PASTA, antes, { recursive: true });
  const journal = JSON.parse(await readFile(join(PASTA, 'meta/_journal.json'), 'utf8')) as Journal;
  const posicao = journal.entries.findIndex((e) => e.tag === TAG);
  expect(posicao).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, posicao);
  await writeFile(join(antes, 'meta/_journal.json'), JSON.stringify(journal));
  await migrate(drizzle(pool), { migrationsFolder: antes });
}, 60_000);

afterAll(async () => {
  await pool.end();
  await banco?.apagar();
  if (antes) await rm(antes, { recursive: true, force: true });
});

describe(`migração ${TAG} com dados existentes`, () => {
  it('não reescreve estudantes nem disparos; o canal dos disparos antigos fica nulo', async () => {
    const { rows: estudantes } = await pool.query<{ id: string }>(
      `INSERT INTO estudante (telefone_hmac, telefone_cifrado, email_hmac, email_cifrado, curso)
       VALUES ('tel-1', 'cifra-1', 'email-1', 'cifra-e', 'Direito'), ('tel-2', 'cifra-2', NULL, NULL, NULL)
       RETURNING id`,
    );
    const [um, dois] = estudantes.map((e) => e.id);
    await pool.query(
      `INSERT INTO disparo (tipo, aviso, estudante_id, modelo, reservado_em, enviado_em, wamid_hmac)
       VALUES ('meta_batida', 'p-1', $1, 'm', now(), now(), 'w-1'), ('conferencia', 'p-2', $2, 'm', NULL, NULL, NULL)`,
      [um, dois],
    );
    const instantaneo = async () =>
      (
        await pool.query<Record<string, unknown>>(
          `SELECT e.id, e.telefone_hmac, e.telefone_cifrado, e.email_hmac, e.curso,
                  d.tipo, d.aviso, d.reservado_em, d.enviado_em, d.wamid_hmac
           FROM estudante e JOIN disparo d ON d.estudante_id = e.id ORDER BY d.aviso`,
        )
      ).rows;
    const antesDaMigracao = await instantaneo();

    await migrate(drizzle(pool), { migrationsFolder: PASTA });

    expect(await instantaneo()).toEqual(antesDaMigracao);
    const { rows: canais } = await pool.query<{ canal: string | null }>(
      'SELECT canal FROM disparo ORDER BY aviso',
    );
    expect(canais).toEqual([{ canal: null }, { canal: null }]);
    const { rows: chats } = await pool.query('SELECT * FROM chat_telegram');
    expect(chats).toEqual([]);
    // Nenhuma coluna nova obrigatória no estudante: o INSERT de antes continua valendo.
    await pool.query(
      `INSERT INTO estudante (telefone_hmac, telefone_cifrado) VALUES ('tel-3', 'cifra-3')`,
    );
  });
});
