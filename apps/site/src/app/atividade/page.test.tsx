import type { Atividade, AtividadeItem } from '@lumens/contratos';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buscarAtividade } from '../../dados/api';
import PaginaAtividade from './page';

vi.mock('../../dados/api', () => ({ buscarAtividade: vi.fn() }));

// O evento de conquista do seed (packages/db/seed/data.ts), como o GET /atividade o devolve.
const CONQUISTA: AtividadeItem = {
  tipo: 'status_alterado',
  dados: { de: 'prometido', para: 'conquistada' },
  criado_em: '2026-03-19T12:00:00.000Z',
  pauta_slug: 'laboratorios-abertos-nas-engenharias',
  pauta_titulo: 'Laboratórios de informática abertos no contraturno',
};

const responder = (resposta: Atividade) => vi.mocked(buscarAtividade).mockResolvedValue(resposta);
const render = async (pagina?: string | string[]) =>
  renderToStaticMarkup(
    await PaginaAtividade({
      searchParams: Promise.resolve(pagina === undefined ? {} : { pagina }),
    }),
  );

describe('/atividade', () => {
  afterEach(() => vi.resetAllMocks());

  it('mostra o evento com rótulo, data de Maceió e link da pauta', async () => {
    responder({ itens: [CONQUISTA], proximo: null });
    const html = await render();
    expect(buscarAtividade).toHaveBeenCalledWith(1);
    expect(html).toContain('Status alterado');
    // 12h UTC são 9h em Maceió (UTC−3, sem horário de verão).
    expect(html).toContain('>19/03/2026, 09:00</time>');
    expect(html).toContain(
      'href="/p/laboratorios-abertos-nas-engenharias">Laboratórios de informática abertos no contraturno</a>',
    );
    // Página única: nada de navegação.
    expect(html).not.toContain('Páginas da atividade');
  });

  it('a hora não depende do fuso do servidor: 01h UTC ainda é o dia anterior em Maceió', async () => {
    responder({ itens: [{ ...CONQUISTA, criado_em: '2026-03-19T01:30:00.000Z' }], proximo: null });
    expect(await render()).toContain('>18/03/2026, 22:30</time>');
  });

  it('mantém a ordem da API (mais novo primeiro)', async () => {
    const antigo = { ...CONQUISTA, pauta_titulo: 'Antigo', criado_em: '2026-02-01T12:00:00.000Z' };
    responder({ itens: [CONQUISTA, antigo], proximo: null });
    const html = await render();
    expect(html.indexOf('Laboratórios')).toBeLessThan(html.indexOf('Antigo'));
  });

  it('?pagina=2 busca a página 2 e liga a anterior e a seguinte', async () => {
    responder({ itens: [CONQUISTA], proximo: 40 });
    const html = await render('2');
    expect(buscarAtividade).toHaveBeenCalledWith(2);
    expect(html).toContain('rel="prev" href="/atividade"');
    expect(html).toContain('rel="next" href="/atividade?pagina=3"');
  });

  it('na primeira página com mais eventos, só tem o link da seguinte', async () => {
    responder({ itens: [CONQUISTA], proximo: 20 });
    const html = await render();
    expect(html).toContain('rel="next" href="/atividade?pagina=2"');
    expect(html).not.toContain('rel="prev"');
  });

  it.each(['0', '-1', 'abc', '1.5', '999999999999', ''])(
    '?pagina=%s inválida vira a primeira página',
    async (pagina) => {
      responder({ itens: [CONQUISTA], proximo: null });
      await render(pagina);
      expect(buscarAtividade).toHaveBeenCalledWith(1);
    },
  );

  it('?pagina repetida usa a primeira', async () => {
    responder({ itens: [CONQUISTA], proximo: null });
    await render(['3', '5']);
    expect(buscarAtividade).toHaveBeenCalledWith(3);
  });

  it('página além do fim mostra estado vazio com volta para a primeira', async () => {
    responder({ itens: [], proximo: null });
    const html = await render('50');
    expect(html).toContain('role="status"');
    expect(html).toContain('Esta página não tem atividade.');
    expect(html).toContain('href="/atividade"');
    expect(html).not.toContain('rel="prev"');
  });

  it('sem atividade nenhuma, estado vazio sem paginação', async () => {
    responder({ itens: [], proximo: null });
    const html = await render();
    expect(html).toContain('Ainda não tem atividade.');
    expect(html).not.toContain('Páginas da atividade');
  });

  it('erro da API sobe para o error.tsx', async () => {
    vi.mocked(buscarAtividade).mockRejectedValue(new Error('API de leitura respondeu 500'));
    await expect(render()).rejects.toThrow('500');
  });
});
