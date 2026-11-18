import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { beforeAll, describe, expect, it } from 'vitest';
import { PAPEL_APLICACAO, PAPEL_SITE } from './app-role';

const PASTA = fileURLToPath(new URL('../migrations', import.meta.url));

/** Aplica uma migração do jeito do Drizzle: um comando por `--> statement-breakpoint`. */
async function aplicar(cliente: PGlite, tag: string) {
  const sql = readFileSync(`${PASTA}/${tag}.sql`, 'utf8');
  for (const comando of sql.split('--> statement-breakpoint')) {
    if (comando.trim() !== '') await cliente.exec(comando);
  }
}

const { entries } = JSON.parse(readFileSync(`${PASTA}/meta/_journal.json`, 'utf8')) as {
  entries: { tag: string }[];
};
const ANTES = entries.slice(
  0,
  entries.findIndex((e) => e.tag.startsWith('0026_')),
);

let cliente: PGlite;

// Banco "de produção" parado na migração 0025, com dados reais de antes das várias fotos.
beforeAll(async () => {
  cliente = new PGlite({ extensions: { pg_trgm, unaccent } });
  await cliente.exec(`CREATE ROLE "${PAPEL_APLICACAO}"; CREATE ROLE "${PAPEL_SITE}"`);
  for (const { tag } of ANTES) await aplicar(cliente, tag);

  await cliente.exec(`
    INSERT INTO estudante (id, telefone_hmac, telefone_cifrado, curso)
      VALUES ('00000000-0000-0000-0000-0000000000e1', 'h1', 'c1', 'Jornalismo');
    INSERT INTO curador (id, email_hmac, email_cifrado, nome)
      VALUES ('00000000-0000-0000-0000-0000000000c1', 'eh', 'ec', 'Curador');
    INSERT INTO pauta (id, slug, titulo, descricao, categoria, status, meta)
      VALUES ('00000000-0000-0000-0000-0000000000a1', 'pauta-publica', 'Pública', 'd', 'infraestrutura', 'juntando_apoios', 10);
    INSERT INTO relato (id, pauta_id, estudante_id, texto, foto_chave, moderacao, moderado_em, moderado_por) VALUES
      ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'aprovado com foto', 'fotos/2026/11/a.jpg', 'aprovado', now(), '00000000-0000-0000-0000-0000000000c1'),
      ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'pendente com foto', 'fotos/2026/11/p.jpg', 'pendente', NULL, NULL),
      ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'recusado com foto', 'fotos/2026/11/r.jpg', 'recusado', now(), '00000000-0000-0000-0000-0000000000c1'),
      ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'aprovado sem foto', NULL, 'aprovado', now(), '00000000-0000-0000-0000-0000000000c1');
    INSERT INTO bloco (slug, nome, base_estudantes) VALUES
      ('praca-de-alimentacao', 'Praça de Alimentação', 100),
      ('outro-bloco', 'Outro bloco', 100);
  `);

  for (const tag of ['0026_fotos_e_pedidos_de_edicao', '0027_remove_praca_de_alimentacao']) {
    await aplicar(cliente, tag);
  }
});

const linhas = async <T>(consulta: string) => (await cliente.query<T>(consulta)).rows;

describe('migração 0026: várias fotos por relato', () => {
  it('a foto única de cada relato vira a foto 1, com a moderação do relato', async () => {
    expect(
      await linhas(
        `SELECT chave, ordem, moderacao::text AS moderacao, motivo_recusa
         FROM relato_foto ORDER BY chave`,
      ),
    ).toEqual([
      { chave: 'fotos/2026/11/a.jpg', ordem: 1, moderacao: 'aprovado', motivo_recusa: null },
      { chave: 'fotos/2026/11/p.jpg', ordem: 1, moderacao: 'pendente', motivo_recusa: null },
      {
        chave: 'fotos/2026/11/r.jpg',
        ordem: 1,
        moderacao: 'recusado',
        motivo_recusa: 'Recusada junto com o relato.',
      },
    ]);
  });

  it('nenhum relato se perde e a coluna antiga some', async () => {
    expect(await linhas(`SELECT count(*)::int AS total FROM relato`)).toEqual([{ total: 4 }]);
    expect(
      await linhas(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'relato' AND column_name = 'foto_chave'`,
      ),
    ).toEqual([]);
  });

  it('a view pública mostra só as fotos aprovadas de relato aprovado, em array', async () => {
    expect(await linhas(`SELECT texto, fotos FROM v_relato_publico ORDER BY texto`)).toEqual([
      { texto: 'aprovado com foto', fotos: ['fotos/2026/11/a.jpg'] },
      { texto: 'aprovado sem foto', fotos: [] },
    ]);
  });

  it('a view continua legível pelo login do site e sem id interno', async () => {
    expect(
      await linhas(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'v_relato_publico' ORDER BY ordinal_position`,
      ),
    ).toEqual([
      { column_name: 'pauta_slug' },
      { column_name: 'texto' },
      { column_name: 'fotos' },
      { column_name: 'curso' },
      { column_name: 'moderado_em' },
    ]);
    expect(
      await linhas(
        `SELECT has_table_privilege('${PAPEL_SITE}', 'v_relato_publico', 'SELECT') AS ok,
                has_table_privilege('${PAPEL_SITE}', 'relato_foto', 'SELECT') AS tabela`,
      ),
    ).toEqual([{ ok: true, tabela: false }]);
  });
});

describe('migração 0027: bloco praca-de-alimentacao', () => {
  it('apaga o bloco sem pauta e mantém os outros', async () => {
    expect(await linhas(`SELECT slug FROM bloco ORDER BY slug`)).toEqual([{ slug: 'outro-bloco' }]);
  });

  it('mantém o bloco que alguma pauta ainda usa', async () => {
    const outro = await PGlite.create({ extensions: { pg_trgm, unaccent } });
    await outro.exec(`CREATE ROLE "${PAPEL_APLICACAO}"; CREATE ROLE "${PAPEL_SITE}"`);
    for (const { tag } of entries.slice(0, entries.length - 1)) await aplicar(outro, tag);
    await outro.exec(`
      INSERT INTO bloco (id, slug, nome, base_estudantes)
        VALUES ('00000000-0000-0000-0000-0000000000d1', 'praca-de-alimentacao', 'Praça', 100);
      INSERT INTO pauta (slug, titulo, descricao, categoria, meta, bloco_id)
        VALUES ('p', 't', 'd', 'infraestrutura', 10, '00000000-0000-0000-0000-0000000000d1');
    `);
    await aplicar(outro, '0027_remove_praca_de_alimentacao');
    expect((await outro.query(`SELECT slug FROM bloco`)).rows).toEqual([
      { slug: 'praca-de-alimentacao' },
    ]);
    // Rodar de novo não muda nada.
    await aplicar(outro, '0027_remove_praca_de_alimentacao');
    expect((await outro.query(`SELECT slug FROM bloco`)).rows).toHaveLength(1);
  });
});

describe('voltar atrás (docs/operacao/migracoes-fotos-e-limpeza-de-blocos.md)', () => {
  it('o SQL documentado devolve o esquema anterior e a primeira foto de cada relato', async () => {
    const doc = readFileSync(
      fileURLToPath(
        new URL('../../../docs/operacao/migracoes-fotos-e-limpeza-de-blocos.md', import.meta.url),
      ),
      'utf8',
    );
    // O bloco SQL de volta é o que começa em BEGIN; e termina em COMMIT; dentro do documento.
    const inicio = doc.indexOf('BEGIN;');
    const fim = doc.indexOf('COMMIT;', inicio);
    const volta =
      inicio >= 0 && fim > inicio ? doc.slice(inicio, fim + 'COMMIT;'.length) : undefined;
    expect(volta).toBeDefined();

    const outro = await PGlite.create({ extensions: { pg_trgm, unaccent } });
    await outro.exec(`CREATE ROLE "${PAPEL_APLICACAO}"; CREATE ROLE "${PAPEL_SITE}"`);
    for (const { tag } of entries) await aplicar(outro, tag);
    // O Drizzle guarda as migrações aplicadas aqui; o harness não usa o Drizzle, então cria a tabela.
    await outro.exec(`
      CREATE SCHEMA drizzle;
      CREATE TABLE drizzle.__drizzle_migrations (id serial, hash text, created_at bigint);
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('antes', 1), ('0026', 1795043510405), ('0027', 1795043511405);
      INSERT INTO estudante (id, telefone_hmac, telefone_cifrado, curso)
        VALUES ('00000000-0000-0000-0000-0000000000e1', 'h1', 'c1', 'Jornalismo');
      INSERT INTO pauta (id, slug, titulo, descricao, categoria, status, meta)
        VALUES ('00000000-0000-0000-0000-0000000000a1', 'p', 't', 'd', 'infraestrutura', 'juntando_apoios', 10);
      INSERT INTO relato (id, pauta_id, estudante_id, texto, moderacao) VALUES
        ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'com três', 'aprovado'),
        ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'sem foto', 'aprovado');
      INSERT INTO relato_foto (relato_id, chave, ordem, moderacao, motivo_recusa) VALUES
        ('00000000-0000-0000-0000-0000000000b1', 'fotos/2026/11/1.jpg', 1, 'recusado', 'x'),
        ('00000000-0000-0000-0000-0000000000b1', 'fotos/2026/11/2.jpg', 2, 'aprovado', NULL),
        ('00000000-0000-0000-0000-0000000000b1', 'fotos/2026/11/3.jpg', 3, 'aprovado', NULL);
    `);

    await outro.exec(volta ?? '');

    // Fica a primeira foto que não foi recusada; o relato sem foto continua sem.
    expect(
      (await outro.query(`SELECT texto, foto_chave FROM v_relato_publico ORDER BY texto`)).rows,
    ).toEqual([
      { texto: 'com três', foto_chave: 'fotos/2026/11/2.jpg' },
      { texto: 'sem foto', foto_chave: null },
    ]);
    expect(
      (
        await outro.query(
          `SELECT to_regclass('relato_foto') AS a, to_regclass('pedido_edicao') AS b`,
        )
      ).rows,
    ).toEqual([{ a: null, b: null }]);
    // Só a migração anterior ao 0026 continua registrada: o db:migrate reaplica as outras.
    expect((await outro.query(`SELECT hash FROM drizzle.__drizzle_migrations`)).rows).toEqual([
      { hash: 'antes' },
    ]);
  });
});
