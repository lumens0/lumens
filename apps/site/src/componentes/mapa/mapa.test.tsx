import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Pauta, StatusPauta } from '../../dados/tipos';
import { MapaDoCampus } from './MapaDoCampus';
import { PREDIOS } from './predios';
import { lugaresDoMapa, maisUrgente } from './urgencia';

let n = 0;
const pauta = (status: StatusPauta, apoios: number, bloco: string | null = 'bloco-18'): Pauta =>
  ({
    slug: `pauta-${String(++n)}`,
    titulo: `Pauta ${String(n)}`,
    categoria: 'infraestrutura',
    status,
    apoios,
    meta: 300,
    bloco_slug: bloco,
    bloco_nome: bloco === null ? null : `Nome de ${bloco}`,
    criada_em: '2026-11-01T12:00:00.000Z',
  }) as Pauta;

describe('pauta mais urgente', () => {
  it('descumprida vence cobrança, que vence juntando apoios, que vence conquista', () => {
    const lista = [pauta('conquistada', 900), pauta('juntando_apoios', 50), pauta('cobrando', 10)];
    expect(maisUrgente(lista)?.status).toBe('cobrando');
    expect(maisUrgente([...lista, pauta('descumprida', 1)])?.status).toBe('descumprida');
  });

  it('no empate de status, vence a de mais apoios', () => {
    const a = pauta('juntando_apoios', 40);
    const b = pauta('juntando_apoios', 120);
    expect(maisUrgente([a, b])).toBe(b);
  });

  it('lista vazia não tem urgente', () => {
    expect(maisUrgente([])).toBeUndefined();
  });
});

describe('lugares do mapa', () => {
  it('liga a pauta ao prédio pelo slug do bloco', () => {
    const lugares = lugaresDoMapa([pauta('cobrando', 10, 'bloco-18')]);
    const bloco18 = lugares.find((l) => l.predio?.id === 18);
    expect(bloco18?.pautas).toHaveLength(1);
    expect(bloco18?.urgente?.status).toBe('cobrando');
  });

  it('bloco sem desenho e pauta de todo o campus aparecem só na lista', () => {
    const lugares = lugaresDoMapa([
      pauta('cobrando', 10, 'bloco-novo'),
      pauta('prometido', 5, null),
    ]);
    expect(lugares.find((l) => l.nome === 'Nome de bloco-novo')?.predio).toBeUndefined();
    expect(lugares.find((l) => l.nome === 'Todo o campus')?.pautas).toHaveLength(1);
  });

  it('a lista começa pelo lugar mais urgente', () => {
    const lugares = lugaresDoMapa([
      pauta('conquistada', 500, 'engenharias'),
      pauta('descumprida', 3, 'residencia-universitaria'),
      pauta('cobrando', 40, 'artes'),
    ]).filter((l) => l.pautas.length > 0);
    expect(lugares.map((l) => l.urgente?.status)).toEqual([
      'descumprida',
      'cobrando',
      'conquistada',
    ]);
  });

  it('todo prédio do desenho tem id único e pelo menos um retângulo', () => {
    expect(new Set(PREDIOS.map((p) => p.id)).size).toBe(PREDIOS.length);
    expect(PREDIOS.every((p) => p.retangulos.length > 0)).toBe(true);
  });
});

describe('mapa do campus', () => {
  it('a lista tem a mesma informação do mapa: lugar, quantidade, status mais urgente e cada pauta', () => {
    const p1 = pauta('descumprida', 30, 'bloco-18');
    const p2 = pauta('juntando_apoios', 80, 'bloco-18');
    const html = renderToStaticMarkup(<MapaDoCampus lugares={lugaresDoMapa([p1, p2])} />);

    expect(html).toContain('Bloco 18 · João de Deus · Salas de Aula');
    expect(html).toContain('2 pautas');
    expect(html).toContain('a mais urgente está como Descumprida');
    expect(html).toContain('Mais urgente:');
    expect(html).toContain(`href="/p/${p1.slug}"`);
    expect(html).toContain(`href="/p/${p2.slug}"`);
  });

  it('prédio com pauta é botão no mapa; prédio sem pauta não', () => {
    const html = renderToStaticMarkup(
      <MapaDoCampus lugares={lugaresDoMapa([pauta('cobrando', 1, 'bloco-18')])} />,
    );

    expect(html.match(/<g[^>]*role="button"/g)).toHaveLength(1);
    expect(html).toContain('Reitoria: sem pautas');
  });

  it('sem pautas abertas, a lista avisa', () => {
    expect(renderToStaticMarkup(<MapaDoCampus lugares={lugaresDoMapa([])} />)).toContain(
      'Nenhuma pauta aberta por enquanto.',
    );
  });
});
