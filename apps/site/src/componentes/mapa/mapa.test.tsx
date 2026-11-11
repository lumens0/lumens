import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Bloco, Pauta, StatusPauta } from '../../dados/tipos';
import { MapaDoCampus } from './MapaDoCampus';
import { PREDIOS, siglaDe } from './predios';
import { LEGENDA, marcadoresDoMapa, maisUrgente } from './urgencia';

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
    bloco_nome: bloco,
    criada_em: '2026-11-01T12:00:00.000Z',
  }) as Pauta;

const bloco = (slug: string, nome = slug): Bloco => ({ slug, nome }) as Bloco;
const cor = (rotulo: string) => LEGENDA.find((l) => l.rotulo === rotulo)?.cor;

describe('pauta mais urgente', () => {
  it('descumprida vence cobrança, que vence meta batida, que vence juntando apoios', () => {
    const lista = [pauta('juntando_apoios', 500), pauta('meta_batida', 50), pauta('cobrando', 10)];
    expect(maisUrgente(lista)?.status).toBe('cobrando');
    expect(maisUrgente([...lista, pauta('descumprida', 1)])?.status).toBe('descumprida');
  });

  it('no empate de peso, vence a de mais apoios; conquistada não é aberta', () => {
    const a = pauta('cobrando', 40);
    const b = pauta('prometido', 120);
    expect(maisUrgente([a, b])).toBe(b);
    expect(maisUrgente([pauta('conquistada', 900)])).toBeUndefined();
  });
});

describe('marcadores do mapa', () => {
  it('cor e linha do bloco saem da pauta aberta mais urgente, com as conquistas no fim', () => {
    const [m] = marcadoresDoMapa(
      [bloco('bloco-18', 'Bloco 18')],
      [pauta('juntando_apoios', 10), pauta('descumprida', 5), pauta('conquistada', 300)],
    );
    expect(m).toMatchObject({
      abertas: 2,
      cor: cor('Promessa descumprida'),
      linha: '2 pautas abertas · Promessa descumprida · 1 conquista',
      predio: 64963500, // Bloco 18 - João de Deus, no OpenStreetMap
    });
  });

  it('bloco só com conquistas e bloco vazio têm cores próprias', () => {
    const [soConquista, vazio] = marcadoresDoMapa(
      [bloco('bloco-18'), bloco('biblioteca-central')],
      [pauta('conquistada', 300, 'bloco-18')],
    );
    expect(soConquista).toMatchObject({ cor: cor('Só conquistas'), abertas: 0 });
    expect(vazio).toMatchObject({ cor: cor('Sem pautas'), linha: 'Nenhuma pauta aberta' });
  });

  it('bloco sem prédio no desenho fica só na lista', () => {
    const [m] = marcadoresDoMapa([bloco('bloco-novo', 'Bloco Novo')], []);
    expect(m?.predio).toBeUndefined();
  });

  it('o painel recebe as abertas primeiro, a mais urgente no topo, e as conquistas no fim', () => {
    const conquista = pauta('conquistada', 900);
    const juntando = pauta('juntando_apoios', 10);
    const cobrando = pauta('cobrando', 5);
    const [m] = marcadoresDoMapa([bloco('bloco-18')], [conquista, juntando, cobrando]);
    expect(m?.pautas).toEqual([cobrando, juntando, conquista]);
  });
});

describe('mapa do campus', () => {
  it('prédio ligado a bloco é botão; a lista e a legenda têm a mesma informação', () => {
    const html = renderToStaticMarkup(
      <MapaDoCampus
        marcadores={marcadoresDoMapa(
          [bloco('bloco-18', 'Bloco 18'), bloco('bloco-novo', 'Bloco Novo')],
          [pauta('descumprida', 5)],
        )}
      />,
    );

    expect(html.match(/<g[^>]*role="button"/g)).toHaveLength(1);
    expect(html).toContain('Bloco 18: 1 pauta aberta · Promessa descumprida');
    expect(html).toContain('Bloco Novo');
    expect(html).toContain('A mesma informação, em lista');
    expect(html).toContain('Promessa descumprida');
    expect(html).toContain('Escolha um bloco');
  });
});

describe('prédios do OpenStreetMap', () => {
  it('nome curto para o rótulo do mapa', () => {
    expect(siglaDe('Bloco 18 - João de Deus')).toBe('Bloco 18');
    expect(siglaDe('Centro de Ciências da Saúde - CSAU')).toBe('CSAU');
    expect(siglaDe('Restaurante Universitário')).toBe('RU');
    expect(siglaDe('Biblioteca Central')).toBe('Biblioteca Central');
  });

  it('todo bloco ligado aponta para um prédio que existe no desenho', () => {
    const ligados = PREDIOS.filter((p) => p.blocos.length > 0).map((p) => p.blocos[0]);
    expect(ligados.sort()).toEqual([
      'artes',
      'biblioteca-central',
      'bloco-18',
      'engenharias',
      'saude',
    ]);
  });
});
