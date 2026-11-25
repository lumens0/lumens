import { describe, expect, it } from 'vitest';
import type { Pauta, StatusPauta } from '../../dados/tipos';
import {
  arrastar,
  ativas,
  blocoDoToque,
  clamp,
  deslocar,
  enquadrarLocal,
  enquadrarLugares,
  girar,
  giroDoDesenho,
  interpolar,
  larguraDaPinca,
  LARGURA_MAXIMA,
  LARGURA_MINIMA,
  locaisDe,
  melhor,
  paraODesenho,
  passoDoTeclado,
  porPredio,
  porPrioridade,
  prioDoLocal,
  quadroDaCamera,
  suavizar,
  zoomNoPonto,
  type Camera,
  type Local,
  type Medida,
} from './camera';
import { PREDIOS } from './predios';
import type { MarcadorDoBloco } from './urgencia';

let n = 0;
const pauta = (status: StatusPauta, apoios = 10): Pauta =>
  ({
    slug: `p-${String(++n)}`,
    titulo: `Pauta ${String(n)}`,
    status,
    apoios,
    meta: 100,
    urgente: false,
  }) as Pauta;

const predioComBlocos = (...slugs: string[]) => {
  const predio = PREDIOS.find((p) => slugs.every((s) => p.blocos.includes(s)));
  if (!predio) throw new Error(`sem prédio para ${slugs.join(', ')}`);
  return predio;
};

const marcador = (slug: string, predio: number | undefined, pautas: Pauta[]): MarcadorDoBloco => ({
  slug,
  nome: `Bloco ${slug}`,
  predio,
  abertas: pautas.length,
  cor: '#fff',
  urgente: false,
  linha: '',
  pautas,
});

/** Um lugar que tem prédio no desenho (os testes de câmera só usam esses). */
const noMapa = (l: Local | undefined) => {
  if (!l?.centro) throw new Error('lugar sem centro');
  return { ...l, centro: l.centro };
};

const MEDIDA: Medida = { vw: 1000, vh: 500 };
const CAMERA: Camera = { cx: 1000, cy: 800, w: 1000 };

describe('prioridade das pautas', () => {
  it('descumprida vem antes de cobrando, que vem antes de conquistada', () => {
    const lista = [pauta('conquistada'), pauta('cobrando'), pauta('descumprida')];
    expect([...lista].sort(porPrioridade).map((p) => p.status)).toEqual([
      'descumprida',
      'cobrando',
      'conquistada',
    ]);
  });

  it('a pauta marcada como urgente vem antes de qualquer etapa', () => {
    const urgente = { ...pauta('juntando_apoios', 1), urgente: true };
    const descumprida = pauta('descumprida', 500);
    expect(melhor([descumprida, urgente])).toBe(urgente);
    expect([descumprida, urgente].sort(porPrioridade)[0]).toBe(urgente);
  });

  it('uma conquista que ainda carrega a marca de urgência não passa à frente de pauta aberta', () => {
    const conquista = { ...pauta('conquistada', 900), urgente: true };
    const descumprida = pauta('descumprida', 1);
    expect(melhor([conquista, descumprida])).toBe(descumprida);
    expect([conquista, descumprida].sort(porPrioridade)[0]).toBe(descumprida);
    // Sem pauta aberta, a conquista é a única e segue sendo a melhor.
    expect(melhor([conquista])).toBe(conquista);
  });

  it('no empate de etapa, a de mais apoios vem primeiro', () => {
    const a = pauta('prometido', 5);
    const b = pauta('prometido', 50);
    expect(melhor([a, b])).toBe(b);
  });

  it('sem pautas, não há melhor', () => {
    expect(melhor([])).toBeUndefined();
  });
});

describe('locaisDe', () => {
  const ic = predioComBlocos('ic');
  const compartilhado = PREDIOS.find((p) => p.blocos.length > 1);

  it('um lugar por bloco, com o centro e a base da caixa do prédio', () => {
    const [local] = locaisDe([marcador('ic', ic.id, [pauta('cobrando')])]);
    const [x = 0, y = 0, w = 0, h = 0] = ic.caixa;
    expect(local?.chave).toBe('ic');
    expect(local?.predio?.id).toBe(ic.id);
    expect(local?.centro).toEqual({ x: x + w / 2, y: y + h / 2, s: Math.max(w, h) });
    expect(local?.base).toEqual({ x: x + w / 2, y: y + h });
  });

  it('bloco sem prédio, ou com prédio desconhecido, continua na lista, só não tem lugar no desenho', () => {
    const locais = locaisDe([
      marcador('x', undefined, [pauta('cobrando')]),
      marcador('y', 987654321, [pauta('cobrando')]),
    ]);
    expect(locais.map((l) => l.chave)).toEqual(['x', 'y']);
    for (const l of locais) {
      expect(l.predio).toBeUndefined();
      expect(l.centro).toBeUndefined();
      expect(l.base).toBeUndefined();
      expect(l.pautas).toHaveLength(1);
    }
  });

  it('blocos que moram no mesmo prédio são lugares separados, na mesma posição', () => {
    if (!compartilhado) throw new Error('nenhum prédio com dois blocos');
    const [a = '', b = ''] = compartilhado.blocos;
    const locais = locaisDe([
      marcador(a, compartilhado.id, [pauta('cobrando')]),
      marcador(b, compartilhado.id, [pauta('prometido'), pauta('conquistada')]),
    ]);
    expect(locais.map((l) => [l.chave, l.nome, l.slug])).toEqual([
      [a, `Bloco ${a}`, a],
      [b, `Bloco ${b}`, b],
    ]);
    expect(locais.map((l) => l.pautas.length)).toEqual([1, 2]);
    expect(locais[0]?.centro).toEqual(locais[1]?.centro);
  });

  it('não altera as pautas do marcador original', () => {
    const pautas = [pauta('cobrando')];
    const [local] = locaisDe([marcador('ic', ic.id, pautas)]);
    local?.pautas.push(pauta('prometido'));
    expect(pautas).toHaveLength(1);
  });
});

describe('porPredio e blocoDoToque', () => {
  const compartilhado = PREDIOS.find((p) => p.blocos.length > 1);
  const [a = '', b = ''] = compartilhado?.blocos ?? [];
  const locais = locaisDe([
    marcador(a, compartilhado?.id, [pauta('juntando_apoios')]),
    marcador(b, compartilhado?.id, [pauta('cobrando')]),
    marcador('sem-predio', undefined, [pauta('cobrando')]),
  ]);

  it('agrupa os lugares pelo prédio e deixa de fora os que não têm prédio', () => {
    const grupos = porPredio(locais);
    expect(grupos.size).toBe(1);
    expect(grupos.get(compartilhado?.id ?? 0)?.map((l) => l.chave)).toEqual([a, b]);
  });

  it('tocar no prédio escolhe o primeiro bloco com pauta na etapa filtrada', () => {
    const doPredio = porPredio(locais).get(compartilhado?.id ?? 0) ?? [];
    expect(blocoDoToque(doPredio, null)?.chave).toBe(a);
    expect(blocoDoToque(doPredio, 'cobrando')?.chave).toBe(b);
  });

  it('sem pauta na etapa, escolhe o primeiro bloco; prédio sem lugar não tem bloco', () => {
    const doPredio = porPredio(locais).get(compartilhado?.id ?? 0) ?? [];
    expect(blocoDoToque(doPredio, 'conquistada')?.chave).toBe(a);
    expect(blocoDoToque([], null)).toBeUndefined();
  });
});

describe('pautas ativas e prioridade do lugar', () => {
  const ic = predioComBlocos('ic');
  const [local] = locaisDe([
    marcador('ic', ic.id, [pauta('juntando_apoios'), pauta('cobrando'), pauta('conquistada')]),
  ]) as [Local];

  it('sem filtro, todas; com filtro, só as da etapa', () => {
    expect(ativas(local, null)).toHaveLength(3);
    expect(ativas(local, 'cobrando').map((p) => p.status)).toEqual(['cobrando']);
    expect(ativas(local, 'descumprida')).toEqual([]);
  });

  it('a prioridade do lugar é a da pauta que mais pede atenção; sem pauta na etapa, 9', () => {
    expect(prioDoLocal(local, null)).toBe(1);
    expect(prioDoLocal(local, 'conquistada')).toBe(6);
    expect(prioDoLocal(local, 'descumprida')).toBe(9);
  });

  it('um lugar com conquista urgente e pauta aberta é medido pela pauta aberta', () => {
    const [misto] = locaisDe([
      marcador('ic', predioComBlocos('ic').id, [
        { ...pauta('conquistada'), urgente: true },
        pauta('descumprida'),
      ]),
    ]);
    expect(misto ? prioDoLocal(misto, null) : -2).toBe(0);
  });

  it('um lugar com pauta urgente passa à frente de qualquer etapa', () => {
    const [urgente] = locaisDe([
      marcador('ic', predioComBlocos('ic').id, [{ ...pauta('juntando_apoios'), urgente: true }]),
    ]);
    expect(urgente ? prioDoLocal(urgente, null) : 0).toBe(-1);
  });
});

describe('quadro da câmera', () => {
  it('o viewBox é centrado na câmera e tem a proporção do palco', () => {
    const { viewBox, k } = quadroDaCamera(CAMERA, MEDIDA);
    expect(k).toBe(1);
    expect(viewBox).toBe('500 550 1000 500');
  });

  it('quanto mais aproximado, menos metros por pixel', () => {
    expect(quadroDaCamera({ ...CAMERA, w: 500 }, MEDIDA).k).toBe(0.5);
  });
});

describe('voo da câmera', () => {
  const para: Camera = { cx: 2000, cy: 400, w: 250 };

  it('começa onde estava e termina onde foi mandada', () => {
    expect(interpolar(CAMERA, para, 0)).toEqual(CAMERA);
    expect(interpolar(CAMERA, para, 1)).toEqual(para);
  });

  it('a largura muda em escala, não em linha reta', () => {
    expect(interpolar(CAMERA, para, 0.5).w).toBeCloseTo(500);
  });

  it('suavizar vai de 0 a 1, sai rápido e nunca passa dos limites', () => {
    expect(suavizar(0)).toBe(0);
    expect(suavizar(1)).toBe(1);
    expect(suavizar(0.5)).toBeGreaterThan(0.5);
    expect(suavizar(-3)).toBe(0);
    expect(suavizar(9)).toBe(1);
  });
});

describe('deslocar', () => {
  it('no computador, a lista fica ao lado: sem deslocamento', () => {
    expect(deslocar(1000, 188, MEDIDA, false)).toBe(0);
  });

  it('no celular, o centro desce para o ponto ficar acima da gaveta', () => {
    expect(deslocar(1000, 188, MEDIDA, true)).toBeGreaterThan(0);
    // Uma gaveta mais alta empurra mais.
    expect(deslocar(1000, 400, MEDIDA, true)).toBeGreaterThan(deslocar(1000, 188, MEDIDA, true));
  });
});

describe('enquadrar lugares', () => {
  const ic = predioComBlocos('ic');
  const rua = predioComBlocos('residencia-universitaria');
  const locais = locaisDe([
    marcador('ic', ic.id, [pauta('cobrando')]),
    marcador('residencia-universitaria', rua.id, [pauta('conquistada')]),
  ]);

  it('sem lugar nenhum, não há câmera', () => {
    expect(enquadrarLugares([], null, MEDIDA, false)).toBeNull();
  });

  it('enquadra todos os lugares com pauta, com a largura dentro dos limites', () => {
    const cam = enquadrarLugares(locais, null, MEDIDA, false);
    expect(cam).not.toBeNull();
    expect(cam?.w).toBeGreaterThanOrEqual(200);
    expect(cam?.w).toBeLessThanOrEqual(LARGURA_MAXIMA);
    const xs = locais.map((l) => noMapa(l).centro.x);
    expect(cam?.cx).toBeCloseTo((Math.min(...xs) + Math.max(...xs)) / 2);
  });

  it('com filtro, olha só os lugares da etapa', () => {
    const ic0 = noMapa(locais[0]);
    const cam = enquadrarLugares(locais, 'cobrando', MEDIDA, false);
    expect(cam?.cx).toBeCloseTo(ic0.centro.x);
    expect(cam?.cy).toBeCloseTo(ic0.centro.y);
  });

  it('filtro sem nenhum lugar cai de volta em todos', () => {
    expect(enquadrarLugares(locais, 'descumprida', MEDIDA, false)).toEqual(
      enquadrarLugares(locais, null, MEDIDA, false),
    );
  });

  it('um lugar só não aproxima além do mínimo', () => {
    const cam = enquadrarLugares(locais.slice(0, 1), null, MEDIDA, false);
    expect(cam?.w).toBeGreaterThanOrEqual(200);
  });

  it('no celular, o centro desce abaixo do centro dos lugares', () => {
    const pc = enquadrarLugares(locais, null, MEDIDA, false);
    const cel = enquadrarLugares(locais, null, MEDIDA, true);
    expect(cel?.cy).toBeGreaterThan(pc?.cy ?? 0);
  });
});

describe('enquadrar um lugar', () => {
  const ic = predioComBlocos('ic');
  const local = noMapa(locaisDe([marcador('ic', ic.id, [pauta('cobrando')])])[0]);

  it('centra no prédio e aproxima, nunca abaixo de 230 metros de largura', () => {
    const cam = enquadrarLocal(local, MEDIDA, false, 800);
    expect(cam.cx).toBe(local.centro.x);
    expect(cam.cy).toBe(local.centro.y);
    expect(cam.w).toBe(Math.max(230, local.centro.s * 4.2));
  });

  it('no celular, o prédio sobe para a parte livre acima da gaveta', () => {
    const cam = enquadrarLocal(local, MEDIDA, true, 800);
    expect(cam.cy).toBeGreaterThan(local.centro.y);
  });
});

describe('zoom no ponto', () => {
  it('o ponto sob o ponteiro não se mexe no desenho', () => {
    const px = 700;
    const py = 120;
    const antes = {
      x: CAMERA.cx + (px - MEDIDA.vw / 2) * (CAMERA.w / MEDIDA.vw),
      y: CAMERA.cy + (py - MEDIDA.vh / 2) * (CAMERA.w / MEDIDA.vw),
    };
    const nova = zoomNoPonto(CAMERA, MEDIDA, 0.5, px, py);
    const k = nova.w / MEDIDA.vw;
    expect(nova.cx + (px - MEDIDA.vw / 2) * k).toBeCloseTo(antes.x);
    expect(nova.cy + (py - MEDIDA.vh / 2) * k).toBeCloseTo(antes.y);
    expect(nova.w).toBe(500);
  });

  it('no centro do palco, só a largura muda', () => {
    const nova = zoomNoPonto(CAMERA, MEDIDA, 0.5, MEDIDA.vw / 2, MEDIDA.vh / 2);
    expect(nova.cx).toBeCloseTo(CAMERA.cx);
    expect(nova.cy).toBeCloseTo(CAMERA.cy);
  });

  it('respeita os limites de aproximação e de afastamento', () => {
    expect(zoomNoPonto(CAMERA, MEDIDA, 0.0001, 0, 0).w).toBe(LARGURA_MINIMA);
    expect(zoomNoPonto(CAMERA, MEDIDA, 1000, 0, 0).w).toBe(LARGURA_MAXIMA);
  });
});

describe('pinça', () => {
  it('dedos se afastando aproximam; se juntando, afastam', () => {
    expect(larguraDaPinca(1000, 100, 200)).toBe(500);
    expect(larguraDaPinca(1000, 100, 50)).toBe(2000);
  });

  it('respeita os limites', () => {
    expect(larguraDaPinca(1000, 100, 100_000)).toBe(LARGURA_MINIMA);
    expect(larguraDaPinca(1000, 100, 1)).toBe(LARGURA_MAXIMA);
  });
});

describe('arrastar e teclado', () => {
  it('arrastar para a direita leva a câmera para a esquerda, na escala do zoom', () => {
    expect(arrastar(CAMERA, MEDIDA, 10, -20)).toEqual({ cx: 990, cy: 820, w: 1000 });
    expect(arrastar({ ...CAMERA, w: 500 }, MEDIDA, 10, 0).cx).toBe(995);
  });

  it('o passo das setas são 60 pixels, em metros', () => {
    expect(passoDoTeclado(CAMERA, MEDIDA)).toBe(60);
    expect(passoDoTeclado({ ...CAMERA, w: 500 }, MEDIDA)).toBe(30);
  });

  it('clamp prende o valor entre os limites', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});

describe('giro do mapa', () => {
  const medida: Medida = { vw: 1000, vh: 600 };
  const cam: Camera = { cx: 1000, cy: 800, w: 1000 };

  it('sem giro, a tela e o desenho andam juntos', () => {
    expect(paraODesenho(0, 30, -10)).toEqual([30, -10]);
  });

  it('com o mapa girado um quarto de volta, "para a direita da tela" é "para cima no desenho"', () => {
    const [x, y] = paraODesenho(Math.PI / 2, 10, 0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(-10);
  });

  it('girar soma ao giro e não mexe no resto', () => {
    const a = girar(cam, 0.5);
    const b = girar(a, 0.25);
    expect(a).toEqual({ ...cam, giro: 0.5 });
    expect(b.giro).toBeCloseTo(0.75);
    expect(b).toMatchObject({ cx: 1000, cy: 800, w: 1000 });
  });

  it('o transform gira em torno do ponto que a câmera olha', () => {
    expect(giroDoDesenho(cam)).toBe('rotate(0 1000 800)');
    expect(giroDoDesenho({ ...cam, giro: Math.PI / 2 })).toBe('rotate(90 1000 800)');
  });

  it('arrastar com o mapa girado leva a câmera pelo desenho, não pela tela', () => {
    // Girado 90°, arrastar 100 px para a direita da tela leva a câmera para baixo no desenho.
    const depois = arrastar({ ...cam, giro: Math.PI / 2 }, medida, 100, 0);
    expect(depois.cx).toBeCloseTo(1000);
    expect(depois.cy).toBeCloseTo(800 + 100);
    expect(depois.giro).toBe(Math.PI / 2);
  });

  it('o zoom no ponteiro mantém parado o ponto sob ele, também girado', () => {
    const girada: Camera = { ...cam, giro: 0.7 };
    const [px, py] = [800, 150];
    const mundo = (c: Camera) => {
      const k = c.w / medida.vw;
      const [ox, oy] = paraODesenho(c.giro ?? 0, px - medida.vw / 2, py - medida.vh / 2);
      return [c.cx + ox * k, c.cy + oy * k];
    };
    const antes = mundo(girada);
    const depois = zoomNoPonto(girada, medida, 0.5, px, py);
    expect(depois.giro).toBe(0.7);
    expect(mundo(depois)[0]).toBeCloseTo(antes[0] ?? 0);
    expect(mundo(depois)[1]).toBeCloseTo(antes[1] ?? 0);
  });

  it('o voo da câmera mantém o giro de quem sai', () => {
    const de: Camera = { cx: 0, cy: 0, w: 1000, giro: 1.2 };
    expect(interpolar(de, { cx: 100, cy: 100, w: 500 }, 0.5).giro).toBe(1.2);
    expect(interpolar(cam, { cx: 100, cy: 100, w: 500 }, 0.5)).not.toHaveProperty('giro');
  });

  it('no celular, o deslocamento da gaveta acompanha o giro: continua "para baixo na tela"', () => {
    const celular: Medida = { vw: 400, vh: 800 };
    const ic = predioComBlocos('ic');
    const [local] = locaisDe([marcador('ic', ic.id, [pauta('cobrando')])]);
    if (!local?.centro) throw new Error('lugar sem centro');
    const lugar = { ...local, centro: local.centro };
    const { x, y } = lugar.centro;

    const reto = enquadrarLocal(lugar, celular, true, 800);
    const girado = enquadrarLocal(lugar, celular, true, 800, Math.PI / 2);

    // Sem giro o centro desce no desenho (y maior); girado 90°, o mesmo deslocamento vira x.
    expect(reto.cy).toBeGreaterThan(y);
    expect(reto.cx).toBeCloseTo(x);
    expect(girado.cy).toBeCloseTo(y);
    expect(Math.abs(girado.cx - x)).toBeCloseTo(reto.cy - y);
  });

  it('no computador não há deslocamento, com ou sem giro', () => {
    const grande: Medida = { vw: 1200, vh: 800 };
    const ic = predioComBlocos('ic');
    const [local] = locaisDe([marcador('ic', ic.id, [pauta('cobrando')])]);
    if (!local?.centro) throw new Error('lugar sem centro');
    const lugar = { ...local, centro: local.centro };
    const girado = enquadrarLocal(lugar, grande, false, 800, 1);
    expect(girado.cx).toBeCloseTo(lugar.centro.x);
    expect(girado.cy).toBeCloseTo(lugar.centro.y);
  });
});
