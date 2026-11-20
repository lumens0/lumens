import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PAPEL_APLICACAO, PAPEL_SITE } from './app-role';

// Cada teste sobe um PGlite e aplica dezenas de migrações: o padrão de 5 s estoura em runner lento.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const PASTA = fileURLToPath(new URL('../migrations', import.meta.url));
const TAG = '0031_conquista_curadoria';

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
  entries.findIndex((e) => e.tag === TAG),
);

const PAUTA_CONQUISTADA = '00000000-0000-0000-0000-0000000000a1';
const PAUTA_ABERTA = '00000000-0000-0000-0000-0000000000a2';
const CURADOR = '00000000-0000-0000-0000-0000000000c1';
const ESTUDANTE = '00000000-0000-0000-0000-0000000000e1';

let cliente: PGlite;

// Banco "de produção" parado na migração anterior, com uma pauta conquistada e um relato com foto.
beforeAll(async () => {
  cliente = new PGlite({ extensions: { pg_trgm, unaccent } });
  await cliente.exec(`CREATE ROLE "${PAPEL_APLICACAO}"; CREATE ROLE "${PAPEL_SITE}"`);
  for (const { tag } of ANTES) await aplicar(cliente, tag);
  await cliente.exec(`
    INSERT INTO estudante (id, telefone_hmac, telefone_cifrado, curso)
      VALUES ('${ESTUDANTE}', 'h1', 'c1', 'Jornalismo');
    INSERT INTO curador (id, email_hmac, email_cifrado, nome)
      VALUES ('${CURADOR}', 'eh', 'ec', 'Curador');
    INSERT INTO pauta (id, slug, titulo, descricao, categoria, status, meta) VALUES
      ('${PAUTA_CONQUISTADA}', 'ja-conquistada', 'Já conquistada', 'd', 'infraestrutura', 'conquistada', 10),
      ('${PAUTA_ABERTA}', 'ainda-aberta', 'Ainda aberta', 'd', 'infraestrutura', 'juntando_apoios', 10);
    INSERT INTO relato (id, pauta_id, estudante_id, texto, moderacao, moderado_em, moderado_por)
      VALUES ('00000000-0000-0000-0000-0000000000b1', '${PAUTA_ABERTA}', '${ESTUDANTE}', 'r', 'aprovado', now(), '${CURADOR}');
    INSERT INTO relato_foto (relato_id, chave, ordem, moderacao)
      VALUES ('00000000-0000-0000-0000-0000000000b1', 'fotos/2026/11/relato.jpg', 1, 'aprovado');
  `);
  await aplicar(cliente, TAG);
});

const linhas = async <T>(consulta: string) => (await cliente.query<T>(consulta)).rows;
const falha = async (consulta: string) => {
  try {
    await cliente.exec(consulta);
  } catch (erro) {
    return (erro as { message: string }).message;
  }
  return undefined;
};

describe('migração 0031: o que foi feito na conquista', () => {
  it('não mexe nos dados existentes: a pauta conquistada segue na view, sem texto nem foto', async () => {
    expect(await linhas(`SELECT count(*)::int AS total FROM pauta`)).toEqual([{ total: 2 }]);
    expect(await linhas(`SELECT pauta_slug, o_que_foi_feito, foto_chave FROM v_conquista`)).toEqual(
      [{ pauta_slug: 'ja-conquistada', o_que_foi_feito: null, foto_chave: null }],
    );
  });

  it('a view de conquista ganha as colunas no fim, sem autor nem instante', async () => {
    const colunas = await linhas<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'v_conquista' ORDER BY ordinal_position`,
    );
    expect(colunas.map((c) => c.column_name)).toEqual([
      'pauta_slug',
      'titulo',
      'bloco_nome',
      'conquistada_em',
      'apoios',
      'proposta_executada',
      'criada_em',
      'o_que_foi_feito',
      'foto_chave',
    ]);
    expect(
      await linhas(
        `SELECT has_table_privilege('${PAPEL_SITE}', 'v_conquista', 'SELECT') AS view,
                has_table_privilege('${PAPEL_SITE}', 'conquista_curadoria', 'SELECT') AS tabela`,
      ),
    ).toEqual([{ view: true, tabela: false }]);
  });

  it('aceita texto e foto, e a view e a rota de foto passam a mostrá-los', async () => {
    await cliente.exec(`
      INSERT INTO conquista_curadoria (pauta_id, o_que_foi_feito, foto_chave, atualizado_por)
        VALUES ('${PAUTA_CONQUISTADA}', 'Trocaram as lâmpadas do corredor.', 'fotos/2026/11/conquista.jpg', '${CURADOR}');
    `);
    expect(await linhas(`SELECT o_que_foi_feito, foto_chave FROM v_conquista`)).toEqual([
      {
        o_que_foi_feito: 'Trocaram as lâmpadas do corredor.',
        foto_chave: 'fotos/2026/11/conquista.jpg',
      },
    ]);
    expect(await linhas(`SELECT chave FROM v_foto_publica ORDER BY chave`)).toEqual([
      { chave: 'fotos/2026/11/conquista.jpg' },
      { chave: 'fotos/2026/11/relato.jpg' },
    ]);
  });

  it('a foto da conquista deixa de ser pública se a pauta sai de conquistada', async () => {
    await cliente.exec(`UPDATE pauta SET status = 'cobrando' WHERE id = '${PAUTA_CONQUISTADA}'`);
    expect(await linhas(`SELECT chave FROM v_foto_publica ORDER BY chave`)).toEqual([
      { chave: 'fotos/2026/11/relato.jpg' },
    ]);
    expect(await linhas(`SELECT 1 FROM v_conquista`)).toEqual([]);
    await cliente.exec(`UPDATE pauta SET status = 'conquistada' WHERE id = '${PAUTA_CONQUISTADA}'`);
  });

  it('a foto de uma pauta que não é conquistada nunca entra na view', async () => {
    await cliente.exec(`
      INSERT INTO conquista_curadoria (pauta_id, foto_chave, atualizado_por)
        VALUES ('${PAUTA_ABERTA}', 'fotos/2026/11/aberta.jpg', '${CURADOR}');
    `);
    const chaves = await linhas<{ chave: string }>(`SELECT chave FROM v_foto_publica`);
    expect(chaves.map((c) => c.chave)).not.toContain('fotos/2026/11/aberta.jpg');
    await cliente.exec(`DELETE FROM conquista_curadoria WHERE pauta_id = '${PAUTA_ABERTA}'`);
  });

  it('recusa texto vazio, texto de 161 caracteres, chave fora do padrão e linha sem nada', async () => {
    const inserir = (texto: string, foto: string) =>
      `INSERT INTO conquista_curadoria (pauta_id, o_que_foi_feito, foto_chave, atualizado_por)
         VALUES ('${PAUTA_ABERTA}', ${texto}, ${foto}, '${CURADOR}')`;
    expect(await falha(inserir(`'   '`, 'NULL'))).toContain('conquista_curadoria_texto_de_1_a_160');
    expect(await falha(inserir(`'${'a'.repeat(161)}'`, 'NULL'))).toContain(
      'conquista_curadoria_texto_de_1_a_160',
    );
    expect(await falha(inserir(`'${'a'.repeat(160)}'`, 'NULL'))).toBeUndefined();
    await cliente.exec(`DELETE FROM conquista_curadoria WHERE pauta_id = '${PAUTA_ABERTA}'`);
    expect(await falha(inserir('NULL', `'../segredo.jpg'`))).toContain(
      'conquista_curadoria_chave_da_foto',
    );
    expect(await falha(inserir('NULL', `'fotos/2026/11/a/b.jpg'`))).toContain(
      'conquista_curadoria_chave_da_foto',
    );
    expect(await falha(inserir('NULL', 'NULL'))).toContain('conquista_curadoria_com_texto_ou_foto');
  });

  it('uma linha por pauta e o autor precisa existir', async () => {
    expect(
      await falha(`INSERT INTO conquista_curadoria (pauta_id, o_que_foi_feito, atualizado_por)
        VALUES ('${PAUTA_CONQUISTADA}', 'outra', '${CURADOR}')`),
    ).toContain('conquista_curadoria_pkey');
    expect(
      await falha(`INSERT INTO conquista_curadoria (pauta_id, o_que_foi_feito, atualizado_por)
        VALUES ('${PAUTA_ABERTA}', 'x', '00000000-0000-0000-0000-0000000000ff')`),
    ).toContain('conquista_curadoria_atualizado_por_curador_id_fk');
  });
});
