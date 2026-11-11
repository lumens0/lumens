import { eq, estudantes, eventos, papeisPauta, pautas, relatos, type Db } from '@lumens/db';
import { criarBancoEmMemoria } from '@lumens/db/teste';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarBloco, criarEstudanteVerificado } from '../teste/fabricas';
import { META_MAXIMA } from './meta';
import {
  CATEGORIA_A_CLASSIFICAR,
  TITULO_MAXIMO,
  criarPauta,
  gerarSlug,
  type NovaPautaDoEstudante,
} from './pauta';

let db: Db;

beforeAll(async () => {
  db = await criarBancoEmMemoria();
});

const criar = (entrada: NovaPautaDoEstudante) => db.transaction((tx) => criarPauta(tx, entrada));

async function entradaValida(campos: Partial<NovaPautaDoEstudante> = {}) {
  const estudante = await criarEstudanteVerificado(db);
  const bloco = await criarBloco(db, 1200);
  return {
    estudanteId: estudante.id,
    titulo: 'Bebedouro quebrado no Bloco 18',
    descricao: 'O bebedouro do térreo não funciona há duas semanas.',
    blocoId: bloco.id,
    ...campos,
  } satisfies NovaPautaDoEstudante;
}

function criada(r: Awaited<ReturnType<typeof criar>>) {
  if (!r.criada) throw new Error(`esperava pauta criada, veio ${r.motivo}`);
  return r;
}

describe('criarPauta', () => {
  it('cria a pauta em curadoria, com a meta do bloco congelada e categoria a classificar', async () => {
    const entrada = await entradaValida();
    const r = criada(await criar(entrada));

    const [pauta] = await db.select().from(pautas).where(eq(pautas.id, r.pautaId));
    expect(pauta).toMatchObject({
      titulo: 'Bebedouro quebrado no Bloco 18',
      descricao: 'O bebedouro do térreo não funciona há duas semanas.',
      blocoId: entrada.blocoId,
      status: 'em_curadoria',
      categoria: CATEGORIA_A_CLASSIFICAR,
      // RN04: 10% de 1200 estudantes.
      meta: 120,
      slug: r.slug,
    });
    expect(r.meta).toBe(120);
  });

  it('pauta do campus inteiro (sem bloco) recebe a meta máxima', async () => {
    const r = criada(await criar(await entradaValida({ blocoId: null })));
    expect(r.meta).toBe(META_MAXIMA);
  });

  it('o criador vira owner ativo da pauta (RN06)', async () => {
    const entrada = await entradaValida();
    const r = criada(await criar(entrada));

    const papeis = await db.select().from(papeisPauta).where(eq(papeisPauta.pautaId, r.pautaId));
    expect(papeis).toHaveLength(1);
    expect(papeis[0]).toMatchObject({
      estudanteId: entrada.estudanteId,
      papel: 'owner',
      ate: null,
    });
  });

  it('grava o primeiro relato com a foto, pendente de moderação', async () => {
    const entrada = await entradaValida({
      relato: 'o bebedouro do bloco 18 ta quebrado, sala 12',
      fotoChave: 'pautas/abc/foto.jpg',
    });
    const r = criada(await criar(entrada));

    const lista = await db.select().from(relatos).where(eq(relatos.pautaId, r.pautaId));
    expect(lista).toEqual([
      expect.objectContaining({
        estudanteId: entrada.estudanteId,
        texto: 'o bebedouro do bloco 18 ta quebrado, sala 12',
        fotoChave: 'pautas/abc/foto.jpg',
        moderacao: 'pendente',
      }),
    ]);
  });

  it('sem relato da 2.5 nem foto, o primeiro relato é a descrição', async () => {
    const r = criada(await criar(await entradaValida()));
    const [relato] = await db.select().from(relatos).where(eq(relatos.pautaId, r.pautaId));
    expect(relato).toMatchObject({
      texto: 'O bebedouro do térreo não funciona há duas semanas.',
      fotoChave: null,
    });
  });

  it('registra pauta_criada (não pública) e owner_entrou', async () => {
    const r = criada(await criar(await entradaValida()));
    const lista = await db
      .select({ tipo: eventos.tipo, publico: eventos.publico, dados: eventos.dados })
      .from(eventos)
      .where(eq(eventos.pautaId, r.pautaId));
    expect(lista).toEqual(
      expect.arrayContaining([
        { tipo: 'pauta_criada', publico: false, dados: { status: 'em_curadoria' } },
        expect.objectContaining({ tipo: 'owner_entrou', dados: { papel: 'owner' } }),
      ]),
    );
    expect(lista).toHaveLength(2);
  });

  it('tira espaços das pontas do título e da descrição', async () => {
    const r = criada(
      await criar(await entradaValida({ titulo: '  Wi-Fi da biblioteca  ', descricao: ' Cai. ' })),
    );
    const [pauta] = await db.select().from(pautas).where(eq(pautas.id, r.pautaId));
    expect(pauta).toMatchObject({ titulo: 'Wi-Fi da biblioteca', descricao: 'Cai.' });
  });

  it('dois títulos iguais geram slugs diferentes', async () => {
    const a = criada(await criar(await entradaValida()));
    const b = criada(await criar(await entradaValida()));
    expect(a.slug).not.toBe(b.slug);
    expect(a.slug).toMatch(/^bebedouro-quebrado-no-bloco-18-[0-9a-f]{8}$/);
  });

  describe('recusas, sem gravar nada', () => {
    it.each([
      ['titulo_vazio', { titulo: '   ' }],
      ['titulo_longo', { titulo: 'x'.repeat(TITULO_MAXIMO + 1) }],
      ['descricao_vazia', { descricao: '' }],
      ['descricao_longa', { descricao: 'x'.repeat(2001) }],
    ] as const)('%s', async (motivo, campos) => {
      const entrada = await entradaValida(campos);
      expect(await criar(entrada)).toEqual({ criada: false, motivo });
      expect(
        await db.select().from(papeisPauta).where(eq(papeisPauta.estudanteId, entrada.estudanteId)),
      ).toEqual([]);
    });

    it('título de exatamente 80 caracteres, com acento e emoji, é aceito', async () => {
      const titulo = `${'á'.repeat(TITULO_MAXIMO - 1)}💧`;
      expect((await criar(await entradaValida({ titulo }))).criada).toBe(true);
    });

    it('bloco que não existe', async () => {
      const entrada = await entradaValida({ blocoId: '00000000-0000-4000-8000-000000000000' });
      expect(await criar(entrada)).toEqual({ criada: false, motivo: 'bloco_inexistente' });
    });

    it.each([
      ['não verificado', { verificadoEm: null }],
      ['que saiu', { saiuEm: new Date() }],
    ])('estudante %s (RN01)', async (_, mudanca) => {
      const entrada = await entradaValida();
      await db.update(estudantes).set(mudanca).where(eq(estudantes.id, entrada.estudanteId));
      expect(await criar(entrada)).toEqual({ criada: false, motivo: 'estudante_nao_verificado' });
    });

    it('estudante que não existe', async () => {
      const entrada = await entradaValida({ estudanteId: '00000000-0000-4000-8000-000000000000' });
      expect(await criar(entrada)).toEqual({ criada: false, motivo: 'estudante_nao_verificado' });
    });
  });
});

describe('gerarSlug', () => {
  const id = '1a2b3c4d-0000-4000-8000-000000000000';

  it.each([
    ['Bebedouro quebrado no Bloco 18!', 'bebedouro-quebrado-no-bloco-18-1a2b3c4d'],
    ['Iluminação & segurança', 'iluminacao-seguranca-1a2b3c4d'],
    ['   ', 'pauta-1a2b3c4d'],
    ['💧💧', 'pauta-1a2b3c4d'],
  ])('%j → %s', (titulo, esperado) => {
    expect(gerarSlug(titulo, id)).toBe(esperado);
  });

  it('corta títulos longos sem terminar em hífen', () => {
    const slug = gerarSlug(`${'palavra '.repeat(20)}fim`, id);
    expect(slug.length).toBeLessThanOrEqual(60 + 9);
    expect(slug).not.toMatch(/--/);
    expect(slug.endsWith('-1a2b3c4d')).toBe(true);
  });
});
