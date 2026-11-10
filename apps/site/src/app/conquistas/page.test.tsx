import type { Conquista } from '@lumens/contratos';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buscarConquistas } from '../../dados/api';
import PaginaConquistas from './page';

vi.mock('../../dados/api', () => ({ buscarConquistas: vi.fn() }));

// A conquista do seed (packages/db/seed/data.ts), como o GET /conquistas a devolve.
const DO_SEED: Conquista = {
  pauta_slug: 'laboratorios-abertos-nas-engenharias',
  titulo: 'Laboratórios de informática abertos no contraturno',
  bloco_nome: 'Bloco das Engenharias (fictício)',
  conquistada_em: '2026-03-19T12:00:00.000Z',
  apoios: 300,
  proposta_executada: false,
  criada_em: '2026-02-10T12:00:00.000Z',
};

const render = async () => renderToStaticMarkup(await PaginaConquistas());

describe('/conquistas', () => {
  afterEach(() => vi.resetAllMocks());

  it('sem conquista, mostra o estado vazio', async () => {
    vi.mocked(buscarConquistas).mockResolvedValue([]);
    const html = await render();
    expect(html).toContain('role="status"');
    expect(html).toContain('Ainda não tem conquista.');
    expect(html).not.toContain('<ul');
  });

  it('a conquista do seed mostra data, apoios, dias até a entrega e o link da pauta', async () => {
    vi.mocked(buscarConquistas).mockResolvedValue([DO_SEED]);
    const html = await render();
    expect(html).toContain('href="/p/laboratorios-abertos-nas-engenharias"');
    expect(html).toContain('Bloco das Engenharias (fictício)');
    expect(html).toContain(
      '<dt>Conquistada em</dt><dd><time dateTime="2026-03-19T12:00:00.000Z">19/03/2026</time></dd>',
    );
    expect(html).toContain('<dt>Apoios</dt><dd>300</dd>');
    // 10/02 a 19/03 de 2026: 37 dias.
    expect(html).toContain('<dt>Da criação à entrega</dt><dd>37 dias</dd>');
    expect(html).not.toContain('Solução da comunidade');
  });

  it('com proposta executada, mostra o selo de solução da comunidade', async () => {
    vi.mocked(buscarConquistas).mockResolvedValue([{ ...DO_SEED, proposta_executada: true }]);
    expect(await render()).toContain('Solução da comunidade');
  });

  it('a data sai no fuso de Maceió: 02h UTC ainda é o dia anterior', async () => {
    vi.mocked(buscarConquistas).mockResolvedValue([
      { ...DO_SEED, conquistada_em: '2026-03-19T02:00:00.000Z' },
    ]);
    expect(await render()).toContain('>18/03/2026</time>');
  });

  it('sem a data da conquista, não inventa data nem prazo', async () => {
    vi.mocked(buscarConquistas).mockResolvedValue([{ ...DO_SEED, conquistada_em: null }]);
    const html = await render();
    expect(html).not.toContain('Conquistada em');
    expect(html).not.toContain('Da criação à entrega');
    expect(html).toContain('<dt>Apoios</dt><dd>300</dd>');
  });
});
