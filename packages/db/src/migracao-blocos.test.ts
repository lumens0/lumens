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
const NOVOS = ['residencia-universitaria', 'edge-academy', 'nees', 'crad'];

async function aplicar(cliente: PGlite, tag: string) {
  for (const comando of readFileSync(`${PASTA}/${tag}.sql`, 'utf8').split(
    '--> statement-breakpoint',
  )) {
    if (comando.trim() !== '') await cliente.exec(comando);
  }
}

/** Banco parado antes da 0028, com os blocos que o teste puser. */
async function bancoAntes0028(slugsExistentes: string[]) {
  const cliente = new PGlite({ extensions: { pg_trgm, unaccent } });
  await cliente.exec(`CREATE ROLE "${PAPEL_APLICACAO}"; CREATE ROLE "${PAPEL_SITE}"`);
  const i = entries.findIndex((e) => e.tag.startsWith('0028_'));
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

describe('migração 0028: blocos novos do catálogo nos bancos já semeados', () => {
  it('banco com o catálogo real: entram a Residência, a EDGE Academy, o NEES e o CRAD, com os dados do catálogo', async () => {
    const c = await bancoAntes0028(['ic', 'ru']);
    await aplicar(c, '0028_blocos_residencia_edge_nees_crad');
    expect(await slugs(c)).toEqual(['ic', 'ru', ...NOVOS].sort());
    for (const slug of NOVOS) {
      const catalogo = blocosUfal.find((b) => b.slug === slug);
      expect(
        (await c.query(`SELECT nome, base_estudantes FROM bloco WHERE slug = $1`, [slug])).rows,
        slug,
      ).toEqual([{ nome: catalogo?.nome, base_estudantes: catalogo?.baseEstudantes }]);
    }
  });

  it('rodar de novo não duplica nem muda o que já existe', async () => {
    const c = await bancoAntes0028(['ic', 'crad']);
    await c.query(
      `UPDATE bloco SET nome = 'CRAD da equipe', base_estudantes = 999 WHERE slug = 'crad'`,
    );
    await aplicar(c, '0028_blocos_residencia_edge_nees_crad');
    await aplicar(c, '0028_blocos_residencia_edge_nees_crad');
    expect(await slugs(c)).toEqual([
      'crad',
      'edge-academy',
      'ic',
      'nees',
      'residencia-universitaria',
    ]);
    expect(
      (await c.query(`SELECT nome, base_estudantes FROM bloco WHERE slug = 'crad'`)).rows,
    ).toEqual([{ nome: 'CRAD da equipe', base_estudantes: 999 }]);
  });

  it('banco de desenvolvimento (blocos fictícios) ou vazio: nada é cadastrado', async () => {
    for (const antes of [[], ['bloco-18', 'artes', 'residencia-universitaria']]) {
      const c = await bancoAntes0028(antes);
      await aplicar(c, '0028_blocos_residencia_edge_nees_crad');
      expect(await slugs(c)).toEqual([...antes].sort());
    }
  });

  it('os quatro estão no catálogo, com slug único e sem "(fictício)"', () => {
    for (const slug of NOVOS) expect(blocosUfal.filter((b) => b.slug === slug)).toHaveLength(1);
  });
});

describe('migração 0028: bases de estudantes', () => {
  it('RUA 135, EDGE Academy 100, NEES 100 e CRAD 50', async () => {
    const c = await bancoAntes0028(['ic']);
    await aplicar(c, '0028_blocos_residencia_edge_nees_crad');
    expect(
      (await c.query(`SELECT slug, base_estudantes FROM bloco WHERE slug <> 'ic' ORDER BY slug`))
        .rows,
    ).toEqual([
      { slug: 'crad', base_estudantes: 50 },
      { slug: 'edge-academy', base_estudantes: 100 },
      { slug: 'nees', base_estudantes: 100 },
      { slug: 'residencia-universitaria', base_estudantes: 135 },
    ]);
  });

  it('RUA já cadastrada com a estimativa antiga (300) é corrigida; valor ajustado à mão não é tocado', async () => {
    const antiga = await bancoAntes0028(['ic']);
    await antiga.query(
      `INSERT INTO bloco (slug, nome, base_estudantes) VALUES ('residencia-universitaria', 'Residência', 300)`,
    );
    await aplicar(antiga, '0028_blocos_residencia_edge_nees_crad');
    expect(
      (
        await antiga.query(
          `SELECT base_estudantes FROM bloco WHERE slug = 'residencia-universitaria'`,
        )
      ).rows,
    ).toEqual([{ base_estudantes: 135 }]);

    const ajustada = await bancoAntes0028(['ic']);
    await ajustada.query(
      `INSERT INTO bloco (slug, nome, base_estudantes) VALUES ('residencia-universitaria', 'Residência', 200)`,
    );
    await aplicar(ajustada, '0028_blocos_residencia_edge_nees_crad');
    expect(
      (
        await ajustada.query(
          `SELECT base_estudantes FROM bloco WHERE slug = 'residencia-universitaria'`,
        )
      ).rows,
    ).toEqual([{ base_estudantes: 200 }]);
  });
});
