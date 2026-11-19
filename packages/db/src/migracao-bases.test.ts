import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { describe, expect, it } from 'vitest';
import { blocosUfal } from '../seed/blocos-ufal';
import { PAPEL_APLICACAO, PAPEL_SITE } from './app-role';

const PASTA = fileURLToPath(new URL('../migrations', import.meta.url));
const { entries } = JSON.parse(readFileSync(`${PASTA}/meta/_journal.json`, 'utf8')) as {
  entries: { tag: string }[];
};
const TAG = '0029_bases_reais_dos_blocos';
const sql = readFileSync(`${PASTA}/${TAG}.sql`, 'utf8');

/** Os pares (slug, velho, novo) que a migração traz, lidos do próprio SQL. */
const MUDANCAS = [...sql.matchAll(/\('([a-z0-9-]+)', (\d+), (\d+)\)/g)].map(
  ([, slug, velho, novo]) => ({ slug: slug ?? '', velho: Number(velho), novo: Number(novo) }),
);

async function bancoAntes(blocos: [string, number][]) {
  const c = new PGlite({ extensions: { pg_trgm, unaccent } });
  await c.exec(`CREATE ROLE "${PAPEL_APLICACAO}"; CREATE ROLE "${PAPEL_SITE}"`);
  const i = entries.findIndex((e) => e.tag === TAG);
  for (const { tag } of entries.slice(0, i)) {
    for (const cmd of readFileSync(`${PASTA}/${tag}.sql`, 'utf8').split(
      '--> statement-breakpoint',
    )) {
      if (cmd.trim() !== '') await c.exec(cmd);
    }
  }
  for (const [slug, base] of blocos) {
    await c.query(`INSERT INTO bloco (slug, nome, base_estudantes) VALUES ($1, $1, $2)`, [
      slug,
      base,
    ]);
  }
  return c;
}

const bases = async (c: PGlite) =>
  Object.fromEntries(
    (
      await c.query<{ slug: string; base_estudantes: number }>(
        `SELECT slug, base_estudantes FROM bloco`,
      )
    ).rows.map((r) => [r.slug, r.base_estudantes]),
  );

describe('migração 0029: bases reais dos blocos', () => {
  it('traz os mesmos números do catálogo, e a base antiga não é mais a do catálogo', () => {
    expect(MUDANCAS.length).toBeGreaterThan(20);
    for (const { slug, velho, novo } of MUDANCAS) {
      const noCatalogo = blocosUfal.find((b) => b.slug === slug);
      expect(noCatalogo?.baseEstudantes, slug).toBe(novo);
      expect(velho, slug).not.toBe(novo);
    }
  });

  it('troca a estimativa antiga pela nova', async () => {
    const c = await bancoAntes(MUDANCAS.map((m) => [m.slug, m.velho]));
    await c.exec(sql);
    expect(await bases(c)).toEqual(Object.fromEntries(MUDANCAS.map((m) => [m.slug, m.novo])));
  });

  it('base ajustada à mão não é tocada, e bloco de outro slug (desenvolvimento) também não', async () => {
    const c = await bancoAntes([
      ['ic', 777], // ajustada por alguém
      ['cedu', 700], // ainda a estimativa antiga
      ['artes', 800], // bloco fictício do seed
    ]);
    await c.exec(sql);
    expect(await bases(c)).toEqual({ ic: 777, cedu: 1139, artes: 800 });
  });

  it('rodar de novo não muda nada', async () => {
    const c = await bancoAntes([['cedu', 700]]);
    await c.exec(sql);
    await c.exec(sql);
    expect(await bases(c)).toEqual({ cedu: 1139 });
  });
});
