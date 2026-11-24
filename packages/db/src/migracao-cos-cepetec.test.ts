import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { describe, expect, it, vi } from 'vitest';
import { blocosUfal } from '../seed/blocos-ufal';
import { PAPEL_APLICACAO, PAPEL_SITE } from './app-role';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const PASTA = fileURLToPath(new URL('../migrations', import.meta.url));
const { entries } = JSON.parse(readFileSync(`${PASTA}/meta/_journal.json`, 'utf8')) as {
  entries: { tag: string }[];
};
const TAG = '0032_blocos_cos_cepetec';

async function aplicar(cliente: PGlite, tag: string) {
  for (const comando of readFileSync(`${PASTA}/${tag}.sql`, 'utf8').split(
    '--> statement-breakpoint',
  )) {
    if (comando.trim() !== '') await cliente.exec(comando);
  }
}

async function bancoAntes(slugsExistentes: string[]) {
  const cliente = new PGlite({ extensions: { pg_trgm, unaccent } });
  await cliente.exec(`CREATE ROLE "${PAPEL_APLICACAO}"; CREATE ROLE "${PAPEL_SITE}"`);
  const i = entries.findIndex((e) => e.tag === TAG);
  for (const { tag } of entries.slice(0, i)) await aplicar(cliente, tag);
  for (const slug of slugsExistentes) {
    await cliente.query(`INSERT INTO bloco (slug, nome, base_estudantes) VALUES ($1, $1, 100)`, [
      slug,
    ]);
  }
  return cliente;
}

const slugs = async (c: PGlite) =>
  (await c.query<{ slug: string }>(`SELECT slug FROM bloco ORDER BY slug`)).rows.map((r) => r.slug);

describe('migração 0032: CEPETEC e COS nos bancos já semeados', () => {
  it('banco com o catálogo real: entram os dois, com os dados do catálogo', async () => {
    const c = await bancoAntes(['ic']);
    await aplicar(c, TAG);
    expect(await slugs(c)).toEqual(['cepetec', 'cos', 'ic']);
    for (const slug of ['cepetec', 'cos']) {
      const catalogo = blocosUfal.find((b) => b.slug === slug);
      expect(
        (await c.query(`SELECT nome, base_estudantes FROM bloco WHERE slug = $1`, [slug])).rows,
        slug,
      ).toEqual([{ nome: catalogo?.nome, base_estudantes: catalogo?.baseEstudantes }]);
    }
  });

  it('banco sem o catálogo real (sem o bloco ic) fica como está', async () => {
    const c = await bancoAntes([]);
    await aplicar(c, TAG);
    expect(await slugs(c)).toEqual([]);
  });

  it('rodar de novo não duplica nem muda o que a equipe ajustou', async () => {
    const c = await bancoAntes(['ic', 'cos']);
    await c.query(`UPDATE bloco SET base_estudantes = 999 WHERE slug = 'cos'`);
    await aplicar(c, TAG);
    await aplicar(c, TAG);
    expect(await slugs(c)).toEqual(['cepetec', 'cos', 'ic']);
    expect((await c.query(`SELECT base_estudantes FROM bloco WHERE slug = 'cos'`)).rows).toEqual([
      { base_estudantes: 999 },
    ]);
  });
});
