import { blocosSeed } from '../../../../../packages/db/seed/data';
import { existsSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Bloco, Pauta, StatusPauta } from '../../dados/tipos';
import { MapaDoCampus } from './MapaDoCampus';
import { MapaResumo } from './MapaResumo';
import { AREAS, CAMINHOS, ID_DO_ESTADIO, LADO_DO_LUGAR, PREDIOS, siglaDe } from './predios';
import { STATUS } from '../StatusPill';
import { LEGENDA, marcadoresDoMapa, maisUrgente } from './urgencia';

let n = 0;
const pauta = (status: StatusPauta, apoios: number, bloco: string | null = 'bloco-18'): Pauta =>
  ({
    slug: `pauta-${String(++n)}`,
    titulo: `Pauta ${String(n)}`,
    categoria: 'infraestrutura',
    status,
    urgente: false,
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

  it('pauta marcada como urgente vence qualquer peso de status', () => {
    const urgente = { ...pauta('juntando_apoios', 1), urgente: true };
    expect(maisUrgente([pauta('descumprida', 500), urgente])).toBe(urgente);
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

  it('pauta sem bloco aparece como "Todo o campus"; sem pauta assim, a linha não existe', () => {
    const blocos = [bloco('bloco-18', 'Bloco 18')];
    const comCampus = marcadoresDoMapa(blocos, [pauta('juntando_apoios', 5, null)]);
    expect(comCampus.at(-1)).toMatchObject({
      nome: 'Todo o campus',
      abertas: 1,
      predio: undefined,
    });
    expect(comCampus[0]?.abertas).toBe(0);
    expect(marcadoresDoMapa(blocos, [pauta('juntando_apoios', 5)])).toHaveLength(1);
  });

  it('o painel recebe as abertas primeiro, a mais urgente no topo, e as conquistas no fim', () => {
    const conquista = pauta('conquistada', 900);
    const juntando = pauta('juntando_apoios', 10);
    const cobrando = pauta('cobrando', 5);
    const [m] = marcadoresDoMapa([bloco('bloco-18')], [conquista, juntando, cobrando]);
    expect(m?.pautas).toEqual([cobrando, juntando, conquista]);
  });

  it('o marcador informa que o bloco tem pauta urgente', () => {
    const urgente = { ...pauta('juntando_apoios', 1), urgente: true };
    const [m] = marcadoresDoMapa([bloco('bloco-18')], [pauta('descumprida', 500), urgente]);
    expect(m?.urgente).toBe(true);
    expect(m?.pautas[0]).toBe(urgente);
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
    expect(html).toContain(
      'aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight + - N"',
    );
    expect(html).toContain('aria-describedby="atalhos-mapa"');
    expect(html).toContain('Fechar ajuda do mapa');
    expect(html).toContain('Atalhos do mapa: setas movem');
  });
});

describe('prédios do OpenStreetMap', () => {
  it('nome curto para o rótulo do mapa', () => {
    expect(siglaDe('Bloco 18 - João de Deus')).toBe('Bloco 18');
    expect(siglaDe('Centro de Ciências da Saúde - CSAU')).toBe('CSAU');
    expect(siglaDe('Restaurante Universitário')).toBe('RU');
    expect(siglaDe('Biblioteca Central')).toBe('Biblioteca Central');
  });

  it('todo bloco do seed de desenvolvimento que tem prédio continua achando o prédio', () => {
    const comPredio = ['bloco-18', 'biblioteca-central', 'engenharias', 'saude', 'artes'];
    const slugsDoSeed = blocosSeed.map((b) => b.slug);
    for (const slug of comPredio) {
      expect(slugsDoSeed, slug).toContain(slug);
      expect(
        PREDIOS.some((p) => p.blocos.includes(slug)),
        `bloco ${slug} sem prédio`,
      ).toBe(true);
    }
    // Os que o seed cria e o mapa não conhece ficam só na lista, sem quebrar nada.
    expect(slugsDoSeed).toContain('residencia-universitaria');
  });

  // O catálogo real (SCRUM-292) está no PR do painel; enquanto não chega à main, o teste se pula.
  const catalogo = new URL('../../../../../packages/db/seed/blocos-ufal.ts', import.meta.url);
  it.skipIf(!existsSync(catalogo))(
    'todo slug ligado existe no seed ou no catálogo real, e todo bloco do catálogo tem prédio',
    async () => {
      const { blocosUfal } = (await import(/* @vite-ignore */ catalogo.href)) as {
        blocosUfal: readonly { slug: string }[];
      };
      const reais = blocosUfal.map((b) => b.slug);
      const conhecidos = new Set([...reais, ...blocosSeed.map((b) => b.slug)]);
      const ligados = PREDIOS.flatMap((p) => p.blocos);
      for (const slug of ligados) expect(conhecidos, slug).toContain(slug);
      for (const slug of reais) expect(ligados, slug).toContain(slug);
    },
    // O import dinâmico transforma o catálogo na hora; em runner frio estourava os 5 s padrão (SCRUM-378).
    20_000,
  );
});

describe('lugares que faltavam no mapa (SCRUM-284)', () => {
  const lugar = (sigla: string) => PREDIOS.find((p) => p.sigla === sigla);

  it('EDGE Academy, NEES e CRAD são quadrados do mesmo tamanho e do mesmo giro, ligados aos blocos', () => {
    const lugares = [lugar('EDGE Academy'), lugar('NEES'), lugar('CRAD')];
    expect(lugares.map((p) => p?.blocos)).toEqual([['edge-academy'], ['nees'], ['crad']]);
    // Mesma caixa (o quadrado girado tem a mesma largura e altura nos três) e quatro cantos retos.
    const caixas = lugares.map((p) => p?.caixa.slice(2).map((v) => Math.round(v)));
    expect(new Set(caixas.map((c) => c?.join('x'))).size).toBe(1);
    for (const p of lugares) {
      expect(p?.d.match(/[ML]/g)).toHaveLength(4);
      expect(p?.d.endsWith('Z')).toBe(true);
      const cantos = [...(p?.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g) ?? [])].map(
        ([, x, y]) => [Number(x), Number(y)] as const,
      );
      const lado = (i: number) => {
        const [a1, a2] = [cantos[i], cantos[(i + 1) % 4]];
        return Math.hypot((a2?.[0] ?? 0) - (a1?.[0] ?? 0), (a2?.[1] ?? 0) - (a1?.[1] ?? 0));
      };
      for (let i = 0; i < 4; i++) expect(lado(i)).toBeCloseTo(LADO_DO_LUGAR, 0);
    }
    // Nenhuma bolinha amarela: os lugares são desenhados como prédios.
    expect(renderToStaticMarkup(<MapaDoCampus marcadores={[]} />)).not.toContain('pontoLocal');
  });

  it('a EDGE Academy fica junto à pista de atletismo e o NEES ao lado do IC (Google Maps)', () => {
    const perto = (p: { caixa: readonly number[] } | undefined, alvo: readonly number[]) => {
      const [x = 0, y = 0, w = 0, h = 0] = alvo;
      const [px = 0, py = 0, pw = 0, ph = 0] = p?.caixa ?? [];
      const dx = Math.max(x - (px + pw), 0, px - (x + w));
      const dy = Math.max(y - (py + ph), 0, py - (y + h));
      return Math.hypot(dx, dy);
    };
    const pista = AREAS.filter((a) => a.tipo === 'pista').map((a) => a.caixa);
    expect(Math.min(...pista.map((c) => perto(lugar('EDGE Academy'), c)))).toBeLessThan(40);
    expect(perto(lugar('NEES'), PREDIOS.find((p) => p.id === 202492816)?.caixa ?? [])).toBeLessThan(
      60,
    );
  });

  it('nenhum quadrado toca outro bloco, outra área ou a linha de uma rua', () => {
    type Pt = readonly [number, number];
    const polis = (d: string): Pt[][] =>
      d
        .split('M')
        .filter(Boolean)
        .map((parte) =>
          [...parte.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map(
            ([, x, y]) => [Number(x), Number(y)] as const,
          ),
        );
    const dentro = ([x, y]: Pt, poli: Pt[]) => {
      let em = false;
      for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
        const [xi = 0, yi = 0] = poli[i] ?? [];
        const [xj = 0, yj = 0] = poli[j] ?? [];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) em = !em;
      }
      return em;
    };
    const ponto = (p: Pt, a: Pt, b: Pt) => {
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const t =
        dx === 0 && dy === 0
          ? 0
          : Math.max(
              0,
              Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)),
            );
      return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    };
    const cruza = (a: Pt, b: Pt, c: Pt, d: Pt) => {
      const o = (p: Pt, q: Pt, r: Pt) =>
        (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
    };
    const folga = (quad: Pt[], poli: Pt[], fechado: boolean) => {
      if (fechado && (dentro(quad[0] as Pt, poli) || dentro(poli[0] as Pt, quad))) return 0;
      let menor = Infinity;
      const n = poli.length;
      for (let i = 0; i < 4; i++) {
        const [a, b] = [quad[i] as Pt, quad[(i + 1) % 4] as Pt];
        for (let k = 0; k < (fechado ? n : n - 1); k++) {
          const [c, d] = [poli[k] as Pt, poli[(k + 1) % n] as Pt];
          if (cruza(a, b, c, d)) return 0;
          menor = Math.min(menor, ponto(a, c, d), ponto(c, a, b), ponto(d, a, b));
        }
      }
      return menor;
    };
    const lugares = [lugar('EDGE Academy'), lugar('NEES'), lugar('CRAD')];
    const proprios = new Set(lugares.map((p) => p?.id));
    for (const l of lugares) {
      const [quad = []] = polis(l?.d ?? '');
      const outros = [
        ...PREDIOS.filter((p) => !proprios.has(p.id)).flatMap((p) => polis(p.d)),
        ...AREAS.flatMap((a) => polis(a.d)),
      ];
      // 3 m de folga de qualquer prédio ou área, e a rua (desenhada com 6 m) com 3 m de cada lado.
      for (const poli of outros)
        expect(folga(quad, poli, true), l?.sigla).toBeGreaterThanOrEqual(2.5);
      for (const rua of CAMINHOS.flatMap((d) => polis(d))) {
        expect(folga(quad, rua, false), l?.sigla).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('os três quadrados não se sobrepõem entre si', () => {
    const lugares = [lugar('EDGE Academy'), lugar('NEES'), lugar('CRAD')];
    for (const [i, a] of lugares.entries()) {
      for (const b of lugares.slice(i + 1)) {
        const [ax = 0, ay = 0, aw = 0, ah = 0] = a?.caixa ?? [];
        const [bx = 0, by = 0, bw = 0, bh = 0] = b?.caixa ?? [];
        expect(ax + aw < bx || bx + bw < ax || ay + ah < by || by + bh < ay).toBe(true);
      }
    }
  });

  it('o Estádio da UFAL é o campo isolado, e só ele leva o nome (o outro campo fica sem rótulo)', () => {
    const estadio = AREAS.find((a) => a.id === ID_DO_ESTADIO);
    expect(estadio).toMatchObject({ tipo: 'quadra', nome: 'Estádio da UFAL' });
    expect(AREAS.filter((a) => a.nome === 'Estádio da UFAL')).toHaveLength(1);
    // O campo que tinha o rótulo antes (288827033) continua desenhado, sem nome de estádio.
    expect(AREAS.find((a) => a.id === 288827033)?.nome).toBe('');
  });

  it('a Reitoria (relação multipolygon do OSM) aparece com pátio e nome', () => {
    const reitoria = PREDIOS.find((p) => p.nome === 'Reitoria Universitária');
    expect(reitoria?.sigla).toBe('Reitoria');
    // Dois contornos: o de fora e o pátio.
    expect(reitoria?.d.match(/M/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('a EENF fica no prédio ao norte da FANUT, e não no do CSAU', () => {
    expect(PREDIOS.find((p) => p.blocos.includes('eenf'))?.id).toBe(404594001);
    expect(PREDIOS.find((p) => p.id === 64974284)?.blocos).not.toContain('eenf');
  });

  it('o COS aparece com nome e sigla', () => {
    const cos = PREDIOS.find((p) => p.nome === 'Comunicação Social');
    expect(cos?.sigla).toBe('COS B');
    expect(PREDIOS.find((p) => p.id === 493988335)).toMatchObject({ sigla: 'COS A' });
  });

  it('a pista de atletismo aparece com nome, uma vez só, sem rótulo nas outras raias', () => {
    const pistas = AREAS.filter((a) => a.tipo === 'pista');
    expect(pistas.length).toBeGreaterThan(1);
    expect(pistas.filter((a) => a.nome === 'Pista de atletismo')).toHaveLength(1);
    expect(pistas.every((a) => a.nome === '' || a.nome === 'Pista de atletismo')).toBe(true);
  });

  it('quadras, parques e estacionamentos do OSM entram como áreas abertas', () => {
    const tipos = new Set(AREAS.map((a) => a.tipo));
    for (const tipo of ['pista', 'quadra', 'parque', 'estacionamento'] as const) {
      expect(tipos).toContain(tipo);
    }
    for (const area of AREAS) expect(area.d).toMatch(/^M[\d. LZ-]+Z$/);
  });

  it('o mapa desenha as áreas abertas, e o nome da pista vira dica do desenho', () => {
    const html = renderToStaticMarkup(<MapaDoCampus marcadores={[]} />);
    expect(html).toContain('<title>Pista de atletismo</title>');
    expect(html.match(/class="[^"]*area[^"]*"/g)?.length).toBe(AREAS.length);
  });

  it('prédio sem nome no OSM usa o nome local confirmado; os outros ficam como "sem nome"', () => {
    expect(PREDIOS.find((p) => p.id === 404591641)).toMatchObject({
      nome: 'Centro de Interesse Comunitário',
      sigla: 'CIC',
    });
    const semNome = PREDIOS.filter((p) => p.nome === 'Prédio sem nome no mapa');
    expect(semNome.every((p) => p.sigla === '')).toBe(true);
  });

  it('blocos do ICBS ganham a sigla do instituto antes do número', () => {
    expect(siglaDe('Bloco 05 do ICBS')).toBe('ICBS 05');
    expect(PREDIOS.find((p) => p.nome === 'Bloco 13')?.sigla).toBe('Bloco 13');
  });
});

describe('legenda do mapa', () => {
  it('mostra a cor de toda etapa que o mapa pinta, cada uma uma vez', () => {
    const cores = LEGENDA.map((l) => l.cor);
    for (const status of [
      'juntando_apoios',
      'meta_batida',
      'cobrando',
      'prometido',
      'entregue_em_parte',
      'descumprida',
      'conquistada',
    ] as const) {
      expect(cores).toContain(STATUS[status].ponto);
    }
    expect(new Set(cores).size).toBe(cores.length);
  });
});

describe('lista do mapa: cartões da mesma altura (SCRUM-284)', () => {
  const css = readFileSync(new URL('./mapa.module.css', import.meta.url), 'utf8');

  it('a lista é uma grade e o cartão ocupa a altura da linha da grade', () => {
    expect(css).toMatch(/\.lista\s*\{[^}]*display:\s*grid/);
    expect(css).toMatch(/\.linha\s*\{[^}]*height:\s*100%/);
    expect(css).toMatch(/\.linha\s*\{[^}]*width:\s*100%/);
  });

  it('o crédito do OpenStreetMap no celular ocupa uma linha só, para cobrir poucos nomes', () => {
    const celular = css.slice(css.indexOf('@media (max-width: 720px)'));
    expect(celular).toMatch(/\.credito\s*\{[^}]*white-space:\s*nowrap/);
  });
});

describe('resumo do mapa na home (SCRUM-284)', () => {
  it('desenha as áreas abertas, como a pista de atletismo, sob os caminhos e os prédios', () => {
    const html = renderToStaticMarkup(<MapaResumo marcadores={[]} />);
    const pista = AREAS.find((a) => a.tipo === 'pista');
    expect(pista).toBeDefined();
    expect(html).toContain(`d="${pista?.d ?? ''}"`);
    expect(html.match(/class="[^"]*area[^"]*"/g)?.length).toBe(AREAS.length);
  });
});
