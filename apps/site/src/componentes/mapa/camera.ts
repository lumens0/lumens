// A câmera do mapa e a lista de lugares, sem React nem DOM: o componente só aplica estes números.
import type { Pauta, StatusPauta } from '../../dados/tipos';
import { pontoDentro } from './nomes';
import { PREDIOS, type Predio } from './predios';
import type { MarcadorDoBloco } from './urgencia';

/**
 * Onde a câmera olha (`cx`, `cy`, em metros do desenho) e quantos metros cabem na largura. `giro`
 * (radianos, sentido horário na tela; sem ele, 0) gira o desenho em torno do centro da câmera.
 */
export type Camera = { cx: number; cy: number; w: number; giro?: number };

/**
 * Um deslocamento da tela (`dx`, `dy`) levado para o desenho: com o mapa girado em `giro`,
 * "para a direita da tela" já não é "para o leste do desenho".
 */
export function paraODesenho(giro: number, dx: number, dy: number): [number, number] {
  const c = Math.cos(giro);
  const s = Math.sin(giro);
  return [c * dx + s * dy, -s * dx + c * dy];
}

/** Gira a câmera `delta` radianos, em torno do centro dela. */
export function girar(cam: Camera, delta: number): Camera {
  return { ...cam, giro: (cam.giro ?? 0) + delta };
}

/** O `transform` do desenho girado: em torno do ponto que a câmera olha, que fica parado na tela. */
export function giroDoDesenho(cam: Camera): string {
  const graus = ((cam.giro ?? 0) * 180) / Math.PI;
  return `rotate(${String(graus)} ${String(cam.cx)} ${String(cam.cy)})`;
}

/** O tamanho do palco em pixels. */
export type Medida = { vw: number; vh: number };

/** Limites de aproximação, em metros de largura visível. */
export const LARGURA_MINIMA = 140;
export const LARGURA_MAXIMA = 2300;

/** Abaixo desta largura visível, os nomes de todos os prédios aparecem ("perto"). */
export const LARGURA_DO_PERTO = 620;

/** Celular: abaixo desta largura de tela a lista vira gaveta e a câmera sobe para abrir espaço. */
export const LARGURA_DO_CELULAR = 900;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Quem aparece primeiro numa disputa de cor: o que mais pede atenção. */
const PRIO: Partial<Record<StatusPauta, number>> = {
  descumprida: 0,
  cobrando: 1,
  prometido: 2,
  meta_batida: 3,
  entregue_em_parte: 4,
  juntando_apoios: 5,
  conquistada: 6,
};

export const prio = (p: Pauta) => PRIO[p.status] ?? 9;

/** Conquistada não é pauta aberta: a marca de urgência que sobrou nela não conta. */
const urgenteAberta = (p: Pauta) => p.urgente && p.status !== 'conquistada';

/**
 * Da mais para a menos urgente: a pauta aberta que a curadoria marcou como urgente vem antes de
 * qualquer etapa (como no `maisUrgente` dos marcadores); depois, a etapa (a conquistada por
 * último, mesmo que ainda carregue a marca de urgência); no empate, a de mais apoios.
 */
export const porPrioridade = (a: Pauta, b: Pauta) =>
  Number(urgenteAberta(b)) - Number(urgenteAberta(a)) || prio(a) - prio(b) || b.apoios - a.apoios;

export const melhor = (ps: readonly Pauta[]): Pauta | undefined => [...ps].sort(porPrioridade)[0];

/**
 * Um bloco do campus e as pautas dele. `predio`, `centro` e `base` só existem quando o bloco tem
 * prédio no desenho: o resto (as pautas de todo o campus, um bloco ainda sem prédio) fica só na
 * lista. Blocos que moram no mesmo prédio são lugares separados, com a mesma posição.
 */
export interface Local {
  chave: string;
  nome: string;
  slug: string;
  pautas: Pauta[];
  /** Cursos que apoiam e abrem pauta no bloco (SCRUM-399); vazio ou ausente: aberto a todos. */
  cursos?: readonly string[];
  predio?: Predio;
  centro?: { x: number; y: number; s: number };
  /** Onde o nome fica: o meio da borda de baixo do prédio. */
  base?: { x: number; y: number };
}

/** Um lugar por bloco, na ordem em que os marcadores vêm. */
export function locaisDe(marcadores: readonly MarcadorDoBloco[]): Local[] {
  return marcadores.map((m) => {
    const predio = m.predio === undefined ? undefined : PREDIOS.find((p) => p.id === m.predio);
    const local: Local = {
      chave: m.slug,
      nome: m.nome,
      slug: m.slug,
      pautas: [...m.pautas],
      ...(m.cursos === undefined ? {} : { cursos: m.cursos }),
    };
    if (!predio) return local;
    const [x = 0, y = 0, w = 0, h = 0] = predio.caixa;
    // Em prédio em U ou em L o meio da caixa cai no vão: o marcador fica num ponto dentro dele.
    const [cx, cy] = pontoDentro(predio.d, predio.caixa);
    return {
      ...local,
      predio,
      centro: { x: cx, y: cy, s: Math.max(w, h) },
      base: { x: x + w / 2, y: y + h },
    };
  });
}

/** Os lugares de cada prédio (um prédio pode ter mais de um bloco), pelo id do prédio. */
export function porPredio(locais: readonly Local[]): Map<number, Local[]> {
  const mapa = new Map<number, Local[]>();
  for (const l of locais) {
    if (!l.predio) continue;
    mapa.set(l.predio.id, [...(mapa.get(l.predio.id) ?? []), l]);
  }
  return mapa;
}

/**
 * Qual bloco escolher ao tocar no prédio: o primeiro com pauta na etapa filtrada; se nenhum tem,
 * o primeiro. Sem lugar no prédio, `undefined`.
 */
export function blocoDoToque(
  daquelePredio: readonly Local[],
  filtro: StatusPauta | null,
): Local | undefined {
  return daquelePredio.find((l) => ativas(l, filtro).length > 0) ?? daquelePredio[0];
}

/** As pautas do lugar na etapa filtrada (sem filtro, todas). */
export const ativas = (l: Local, filtro: StatusPauta | null) =>
  l.pautas.filter((p) => !filtro || p.status === filtro);

/** Prioridade do lugar: a da pauta que mais pede atenção (urgente: -1); 9 sem pauta. */
export const prioDoLocal = (l: Local, filtro: StatusPauta | null) => {
  const topo = melhor(ativas(l, filtro));
  if (!topo) return 9;
  return urgenteAberta(topo) ? -1 : prio(topo);
};

/** O `viewBox` do desenho e quantos metros vale um pixel (`k`). */
export function quadroDaCamera(cam: Camera, medida: Medida) {
  const k = cam.w / medida.vw;
  const h = medida.vh * k;
  return {
    k,
    viewBox: `${String(cam.cx - cam.w / 2)} ${String(cam.cy - h / 2)} ${String(cam.w)} ${String(h)}`,
  };
}

/** Passo `e` (0 a 1, já suavizado) do voo de `de` até `para`; a largura cresce em escala. */
export function interpolar(de: Camera, para: Camera, e: number): Camera {
  return {
    ...(de.giro === undefined ? {} : { giro: de.giro }),
    cx: de.cx + (para.cx - de.cx) * e,
    cy: de.cy + (para.cy - de.cy) * e,
    w: de.w * Math.pow(para.w / de.w, e),
  };
}

/** Suaviza o progresso `k` (0 a 1): sai rápido e chega devagar. */
export const suavizar = (k: number) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);

/**
 * Quanto o centro da câmera desce para o ponto ficar na parte livre acima da gaveta (celular).
 * No computador, a lista fica ao lado e não há deslocamento.
 */
export function deslocar(w: number, gavetaPx: number, medida: Medida, celular: boolean): number {
  if (!celular) return 0;
  const k = w / medida.vw;
  const alvo = (74 + medida.vh - gavetaPx) / 2;
  return (medida.vh / 2 - alvo) * k;
}

/** Enquadra todos os lugares (ou só os da etapa filtrada); sem lugar nenhum, `null`. */
export function enquadrarLugares(
  locais: readonly Local[],
  filtro: StatusPauta | null,
  medida: Medida,
  celular: boolean,
): Camera | null {
  const noMapa = locais.filter((l) => l.centro !== undefined);
  let alvo = noMapa.filter((l) => ativas(l, filtro).length > 0);
  if (alvo.length === 0) alvo = noMapa;
  if (alvo.length === 0) return null;
  const centros = alvo.flatMap((l) => (l.centro ? [l.centro] : []));
  const xs = centros.map((c) => c.x);
  const ys = centros.map((c) => c.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const bw = Math.max(x1 - x0, 80);
  const bh = Math.max(y1 - y0, 80);
  const r = medida.vh / medida.vw;
  const util = celular ? 0.58 : 0.8;
  const w = Math.max(bw * 1.5, (bh * 1.5) / (r * util));
  return {
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2 + deslocar(w, 188, medida, celular),
    w: clamp(w, 200, LARGURA_MAXIMA),
  };
}

/** Aproxima o prédio escolhido; no celular, deixa-o acima da gaveta. */
export function enquadrarLocal(
  l: Local & { centro: NonNullable<Local['centro']> },
  medida: Medida,
  celular: boolean,
  alturaDaTela: number,
): Camera {
  const w = Math.max(230, l.centro.s * 4.2);
  return {
    cx: l.centro.x,
    cy: l.centro.y + deslocar(w, Math.min(0.46 * alturaDaTela, 400), medida, celular),
    w,
  };
}

/**
 * Aproxima (`f` < 1) ou afasta (`f` > 1) mantendo parado o ponto da tela (`px`, `py`, relativo ao
 * canto do palco) que está sob o dedo ou o ponteiro.
 */
export function zoomNoPonto(cam: Camera, medida: Medida, f: number, px: number, py: number) {
  const k = cam.w / medida.vw;
  const giro = cam.giro ?? 0;
  const [ox, oy] = paraODesenho(giro, px - medida.vw / 2, py - medida.vh / 2);
  const mx = cam.cx + ox * k;
  const my = cam.cy + oy * k;
  const w = clamp(cam.w * f, LARGURA_MINIMA, LARGURA_MAXIMA);
  const nk = w / medida.vw;
  return {
    ...(cam.giro === undefined ? {} : { giro }),
    cx: mx - ox * nk,
    cy: my - oy * nk,
    w,
  };
}

/** Largura da câmera numa pinça: os dedos se afastando (`distancia` maior) aproximam o mapa. */
export function larguraDaPinca(larguraInicial: number, inicial: number, distancia: number) {
  return clamp((larguraInicial * inicial) / distancia, LARGURA_MINIMA, LARGURA_MAXIMA);
}

/** Arrastar `dx`, `dy` pixels leva a câmera no sentido contrário. */
export function arrastar(cam: Camera, medida: Medida, dx: number, dy: number): Camera {
  const k = cam.w / medida.vw;
  const [mx, my] = paraODesenho(cam.giro ?? 0, dx, dy);
  return { ...cam, cx: cam.cx - mx * k, cy: cam.cy - my * k };
}

/** Passo das setas do teclado: 60 pixels da tela, em metros. */
export const passoDoTeclado = (cam: Camera, medida: Medida) => (cam.w / medida.vw) * 60;
