import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FiltrosDaLista } from './FiltrosDaLista';

// O router do Next não existe fora do app: aqui só o que a tela desenha importa.
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const etapas = {
  juntando_apoios: 2,
  meta_batida: 0,
  cobrando: 1,
  prometido: 0,
  entregue_em_parte: 0,
  descumprida: 0,
  conquistada: 0,
};
const blocos = [
  { slug: 'ic', nome: 'Instituto de Computação', sigla: 'IC', pautas: 2 },
  { slug: 'bc', nome: 'Biblioteca Central', sigla: 'BC', pautas: 0 },
];

const desenhar = (extra: Partial<Parameters<typeof FiltrosDaLista>[0]> = {}) =>
  renderToStaticMarkup(
    <FiltrosDaLista
      q=""
      ordem="atencao"
      status={[]}
      bloco={[]}
      etapas={etapas}
      totalDaBusca={3}
      blocos={blocos}
      totalDeBlocos={2}
      sugestoes={null}
      ativos={null}
      {...extra}
    />,
  );

describe('FiltrosDaLista', () => {
  it('tem um só campo de busca, a ordenação e as etapas com contagem (só as que têm pauta)', () => {
    const html = desenhar();
    expect(html.match(/type="search"/g)).toHaveLength(1);
    expect(html).toContain('placeholder="Buscar pauta ou bloco"');
    expect(html).toContain('Ordenar por');
    expect(html).toContain('O que pede atenção');
    expect(html).toMatch(/Todas <b[^>]*>3<\/b>/);
    expect(html).toContain('Juntando apoios');
    expect(html).toContain('Cobrando');
    expect(html).not.toContain('Meta batida');
  });

  it('os blocos ficam numa lista que abre no próprio lugar, com a contagem de cada um', () => {
    const html = desenhar();
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Escolher entre os 2 blocos');
    expect(html).toMatch(/id="painel-de-blocos"[^>]*hidden/);
    expect(html).toMatch(/Instituto de Computação <b[^>]*>2<\/b>/);
  });

  it('a busca já escrita na URL aparece no campo e a etapa escolhida fica marcada', () => {
    const html = desenhar({ q: 'goteira', status: ['cobrando'] });
    expect(html).toContain('value="goteira"');
    expect(html).toMatch(/aria-pressed="true"[^>]*><i[^>]*><\/i>Cobrando/);
  });
});
