import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { describe, expect, it, vi } from 'vitest';
import { blocosUfal, cadastrarBlocosUfal } from '../seed/blocos-ufal';
import { PAPEL_APLICACAO, PAPEL_SITE } from './app-role';
import { CURSOS } from './cursos';
import {
  AULAS_EM_OUTROS_BLOCOS,
  CURSOS_DOS_BLOCOS,
  CURSOS_PROPRIOS_DOS_BLOCOS,
  SUBBLOCOS,
} from './cursos-dos-blocos';
import { blocoCursos, blocos } from './schema';
import { criarBancoEmMemoria } from './teste';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const PASTA = fileURLToPath(new URL('../migrations', import.meta.url));
const { entries } = JSON.parse(readFileSync(`${PASTA}/meta/_journal.json`, 'utf8')) as {
  entries: { tag: string }[];
};
const TAG = '0033_bloco_curso';

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

const vinculos = async (c: PGlite) =>
  (
    await c.query<{ slug: string; curso: string }>(
      `SELECT b.slug, bc.curso FROM bloco_curso bc JOIN bloco b ON b.id = bc.bloco_id
        ORDER BY b.slug, bc.curso`,
    )
  ).rows;

describe('cursos dos blocos (SCRUM-399): o mapa', () => {
  const slugsDoCatalogo = new Set<string>(blocosUfal.map((b) => b.slug));
  const cursosDoMapa = Object.values(CURSOS_DOS_BLOCOS).flat();

  it('só aponta para blocos do catálogo e sem curso repetido no mesmo bloco', () => {
    for (const [slug, cursos] of Object.entries(CURSOS_DOS_BLOCOS)) {
      expect(slugsDoCatalogo.has(slug), slug).toBe(true);
      expect(new Set(cursos).size, slug).toBe(cursos.length);
    }
  });

  it('todo curso da lista de CURSOS tem pelo menos um bloco', () => {
    expect(CURSOS.filter((c) => !cursosDoMapa.includes(c))).toEqual([]);
  });

  it('espaços compartilhados, lugares e o CSAU ficam abertos (sem cursos)', () => {
    for (const slug of [
      'biblioteca-central',
      'ru',
      'bloco-07',
      'bloco-13',
      'bloco-18',
      'ginasio',
      'residencia-universitaria',
      'crad',
      'csau',
    ]) {
      expect(CURSOS_DOS_BLOCOS[slug], slug).toBeUndefined();
    }
  });
});

describe('cursos dos blocos (SCRUM-399): o seed', () => {
  it('cadastrarBlocosUfal grava os vínculos uma vez só', async () => {
    const db = await criarBancoEmMemoria();
    await cadastrarBlocosUfal(db);
    const antes = await db.select().from(blocoCursos);
    await cadastrarBlocosUfal(db);
    const depois = await db.select().from(blocoCursos);

    expect(antes).toHaveLength(Object.values(CURSOS_DOS_BLOCOS).flat().length);
    expect(depois).toHaveLength(antes.length);
    const ichca = (await db.select().from(blocos)).find((b) => b.slug === 'ichca');
    expect(
      antes
        .filter((v) => v.blocoId === ichca?.id)
        .map((v) => v.curso)
        .sort(),
    ).toEqual([...(CURSOS_DOS_BLOCOS.ichca ?? [])].sort());
  });
});

describe('migração 0033: cursos dos blocos nos bancos já semeados', () => {
  it('banco com o catálogo real: cada bloco ganha os cursos do mapa, e só eles', async () => {
    const c = await bancoAntes(blocosUfal.map((b) => b.slug));
    await aplicar(c, TAG);

    const esperado = Object.entries(CURSOS_PROPRIOS_DOS_BLOCOS)
      .flatMap(([slug, cursos]) => cursos.map((curso) => ({ slug, curso })))
      .sort((a, b) => a.slug.localeCompare(b.slug) || a.curso.localeCompare(b.curso));
    const gravado = await vinculos(c);
    expect(gravado).toHaveLength(esperado.length);
    expect(new Set(gravado.map((v) => `${v.slug}|${v.curso}`))).toEqual(
      new Set(esperado.map((v) => `${v.slug}|${v.curso}`)),
    );
  });

  it('banco de desenvolvimento (outros slugs) não ganha vínculo: os blocos seguem abertos', async () => {
    const c = await bancoAntes(['engenharias', 'saude', 'bloco-18']);
    await aplicar(c, TAG);
    expect(await vinculos(c)).toEqual([]);
  });

  it('bloco que o catálogo deixa aberto não ganha vínculo, mesmo existindo', async () => {
    const c = await bancoAntes(['ic', 'biblioteca-central', 'ru']);
    await aplicar(c, TAG);
    expect([...new Set((await vinculos(c)).map((v) => v.slug))]).toEqual(['ic']);
  });

  it('bloco com cursos vinculados não é apagado: a FK é restrict, como as demais', async () => {
    const c = await bancoAntes(['ic']);
    await aplicar(c, TAG);
    await expect(c.exec(`DELETE FROM bloco WHERE slug = 'ic'`)).rejects.toThrow(/foreign key/);
  });
});

describe('v_bloco com os cursos (SCRUM-401)', () => {
  it('o site lê os cursos de cada bloco pela view: bloco de unidade com a lista, bloco aberto vazio', async () => {
    const db = await criarBancoEmMemoria();
    await cadastrarBlocosUfal(db);
    const resultado: unknown = await db.execute(sql`SELECT slug, cursos FROM v_bloco`);
    const { rows } = resultado as { rows: { slug: string; cursos: string[] }[] };
    const porSlug = new Map(rows.map((r) => [r.slug, r.cursos]));
    expect(porSlug.get('ic')).toEqual(
      [...(CURSOS_DOS_BLOCOS.ic ?? [])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    );
    expect(porSlug.get('biblioteca-central')).toEqual([]);
    expect(porSlug.get('csau')).toEqual([]);
  });
});

describe('cursos com aula em outro bloco (SCRUM-399)', () => {
  it('o IM aceita os cursos do IC, e o IC não aceita Matemática', () => {
    expect([...(CURSOS_DOS_BLOCOS.im ?? [])].sort()).toEqual(
      [
        'Ciência da Computação',
        'Engenharia de Computação',
        'Inteligência Artificial',
        'Matemática',
      ].sort(),
    );
    expect(CURSOS_DOS_BLOCOS.ic).toEqual(CURSOS_PROPRIOS_DOS_BLOCOS.ic);
    expect(CURSOS_DOS_BLOCOS.ic).not.toContain('Matemática');
    expect(CURSOS_DOS_BLOCOS.cepetec).toEqual(CURSOS_PROPRIOS_DOS_BLOCOS.cepetec);
  });

  it('CEPETEC, EDGE Academy e NEES são subblocos do IC: aceitam exatamente o que o IC aceita', () => {
    expect(SUBBLOCOS).toEqual({ cepetec: 'ic', 'edge-academy': 'ic', nees: 'ic' });
    for (const slug of Object.keys(SUBBLOCOS)) {
      expect(CURSOS_DOS_BLOCOS[slug], slug).toEqual(CURSOS_DOS_BLOCOS.ic);
      expect(CURSOS_DOS_BLOCOS[slug], slug).not.toContain('Matemática');
    }
  });

  it('bloco sem aula de outros cursos mantém só os da própria unidade', () => {
    expect(CURSOS_DOS_BLOCOS.ichca).toEqual(CURSOS_PROPRIOS_DOS_BLOCOS.ichca);
    expect(CURSOS_DOS_BLOCOS.cos).toEqual(['Jornalismo', 'Relações Públicas']);
  });

  it('cada bloco e cada curso da regra existem no catálogo', () => {
    const slugs = new Set<string>(blocosUfal.map((b) => b.slug));
    for (const [slug, cursos] of Object.entries(AULAS_EM_OUTROS_BLOCOS)) {
      expect(slugs.has(slug), slug).toBe(true);
      for (const curso of cursos) expect(CURSOS).toContain(curso);
    }
  });

  it('a migração 0036 leva o banco da 0033 ao mapa com as aulas em outros blocos, sem duplicar', async () => {
    const c = await bancoAntes(blocosUfal.map((b) => b.slug));
    await aplicar(c, TAG);
    await aplicar(c, '0036_blocos_coligados');

    const esperado = Object.entries(CURSOS_DOS_BLOCOS).flatMap(([slug, cursos]) =>
      cursos.map((curso) => `${slug}|${curso}`),
    );
    const gravado = (await vinculos(c)).map((v) => `${v.slug}|${v.curso}`);
    expect(gravado).toHaveLength(esperado.length);
    expect(new Set(gravado)).toEqual(new Set(esperado));

    await aplicar(c, '0036_blocos_coligados');
    expect(await vinculos(c)).toHaveLength(esperado.length);
  });

  it('banco de desenvolvimento (outros slugs) segue sem vínculo depois da 0036', async () => {
    const c = await bancoAntes(['engenharias', 'bloco-18']);
    await aplicar(c, TAG);
    await aplicar(c, '0036_blocos_coligados');
    expect(await vinculos(c)).toEqual([]);
  });
});
