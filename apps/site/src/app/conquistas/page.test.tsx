import type { Conquista } from '@lumens/contratos';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buscarConquistas } from '../../dados/api';
import PaginaConquistas from './page';

vi.mock('../../dados/api', () => ({ buscarConquistas: vi.fn() }));
// Fora de uma requisição o `connection()` lança; no teste ele só precisa resolver.
vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));

// A conquista do seed (packages/db/seed/data.ts), como o GET /conquistas a devolve. Os mesmos literais
// são conferidos contra o seed de verdade em packages/db/src/views-publicas.test.ts (v_conquista) e
// apps/backend/src/api/api.test.ts (GET /conquistas); mudou lá, muda aqui.
const DO_SEED: Conquista = {
  pauta_slug: 'laboratorios-abertos-nas-engenharias',
  titulo: 'Laboratórios de informática abertos no contraturno',
  bloco_nome: 'Bloco das Engenharias (fictício)',
  conquistada_em: '2026-03-19T12:00:00.000Z',
  apoios: 300,
  proposta_executada: false,
  criada_em: '2026-02-10T12:00:00.000Z',
  o_que_foi_feito:
    'Os laboratórios das Engenharias passaram a abrir das 18h às 22h, de segunda a sexta.',
  foto: null,
};

const render = async () => renderToStaticMarkup(await PaginaConquistas());

describe('/conquistas', () => {
  afterEach(() => vi.resetAllMocks());

  it('sem conquista, mostra o estado vazio', async () => {
    vi.mocked(buscarConquistas).mockResolvedValue([]);
    const html = await render();
    expect(html).toContain('role="status"');
    expect(html).toContain('Ainda não há conquistas.');
    expect(html).not.toContain('<ul');
  });

  it('título e introdução como no protótipo', async () => {
    vi.mocked(buscarConquistas).mockResolvedValue([DO_SEED]);
    const html = await render();
    expect(html).toMatch(/<h1[^>]*>Conquistas<\/h1>/);
    expect(html).toContain('Pautas que viraram mudança, confirmadas por quem apoiou.');
  });

  it('a conquista do seed é uma linha com título, o que foi feito, dias, apoios, bloco e o link da pauta', async () => {
    vi.mocked(buscarConquistas).mockResolvedValue([DO_SEED]);
    const html = await render();
    expect(html).toContain('href="/p/laboratorios-abertos-nas-engenharias"');
    expect(html).toContain('Laboratórios de informática abertos no contraturno');
    expect(html).toContain('Os laboratórios das Engenharias passaram a abrir');
    expect(html).toContain('Bloco das Engenharias (fictício)');
    expect(html).toContain('<b>300</b> apoios');
    // 10/02 a 19/03 de 2026: 37 dias.
    expect(html).toContain('<b>37 dias</b> da criação à entrega');
  });

  it('sem o que foi feito, a linha não ganha texto vazio', async () => {
    vi.mocked(buscarConquistas).mockResolvedValue([{ ...DO_SEED, o_que_foi_feito: null }]);
    const html = await render();
    expect(html).not.toContain('Os laboratórios das Engenharias');
    expect(html).not.toContain('<img');
  });

  it('API antiga sem criada_em: esconde o prazo em vez de mostrar NaN', async () => {
    const { criada_em: _, ...semCriacao } = DO_SEED;
    vi.mocked(buscarConquistas).mockResolvedValue([semCriacao as Conquista]);
    const html = await render();
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('da criação à entrega');
  });

  it.each([
    // 10/02 22h e 11/02 08h em Maceió: menos de 24 h, mas dias seguintes no calendário.
    ['2026-02-11T01:00:00.000Z', '2026-02-11T11:00:00.000Z', '1 dia'],
    ['2026-02-10T12:00:00.000Z', '2026-02-10T20:00:00.000Z', 'No mesmo dia'],
    // 01h UTC do dia 12 ainda é dia 11 em Maceió.
    ['2026-02-10T12:00:00.000Z', '2026-02-12T01:00:00.000Z', '1 dia'],
  ])('dias pelo calendário de Maceió: %s → %s = %s', async (criada_em, conquistada_em, texto) => {
    vi.mocked(buscarConquistas).mockResolvedValue([{ ...DO_SEED, criada_em, conquistada_em }]);
    expect(await render()).toContain(`<b>${texto}</b> da criação à entrega`);
  });

  it('sem a data da conquista, não inventa prazo', async () => {
    vi.mocked(buscarConquistas).mockResolvedValue([{ ...DO_SEED, conquistada_em: null }]);
    const html = await render();
    expect(html).not.toContain('da criação à entrega');
    expect(html).toContain('<b>300</b> apoios');
  });
});
