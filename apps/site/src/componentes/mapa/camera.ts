import type { PointerEvent as EventoDePonteiro } from 'react';
import { ALTURA_DO_CAMPUS, LARGURA_DO_CAMPUS } from './predios';

/** Pedaço do campus que aparece na tela, em metros do desenho (antes de girar). */
export type Visao = { x: number; y: number; w: number; h: number };

export const ZOOM_MINIMO = 150;
export const ZOOM_MAXIMO = LARGURA_DO_CAMPUS * 1.3;

const DURACAO_MS = 550;
/** Tempo, em ms, para a velocidade do arraste solto cair a 37%. */
const ATRITO_MS = 300;
/** A pinça só começa a girar o mapa depois deste ângulo: zoom com dois dedos não gira sem querer. */
const GIRO_MINIMO = 0.2;

/** Um deslocamento da tela, levado para o desenho girado em `giro` radianos. */
function desgirar(dx: number, dy: number, giro: number): [number, number] {
  const c = Math.cos(giro);
  const s = Math.sin(giro);
  return [c * dx + s * dy, -s * dx + c * dy];
}

/**
 * A visão depois de aproximar (`fator` < 1) ou afastar em torno de um ponto da tela (0 a 1): o que
 * está debaixo do dedo continua debaixo dele, com o mapa girado ou não.
 */
export function aproximar(v: Visao, fator: number, px: number, py: number, giro = 0): Visao {
  const w = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, v.w * fator));
  const h = (w * v.h) / v.w;
  const [dx, dy] = desgirar((px - 0.5) * (v.w - w), (py - 0.5) * (v.h - h), giro);
  return { x: v.x + v.w / 2 + dx - w / 2, y: v.y + v.h / 2 + dy - h / 2, w, h };
}

/** A visão depois de girar o mapa de `giro` para `giro + delta` em torno de um ponto da tela. */
export function girar(v: Visao, giro: number, delta: number, px: number, py: number): Visao {
  const u = (px - 0.5) * v.w;
  const t = (py - 0.5) * v.h;
  const [ax, ay] = desgirar(u, t, giro);
  const [bx, by] = desgirar(u, t, giro + delta);
  return { ...v, x: v.x + ax - bx, y: v.y + ay - by };
}

/**
 * A visão com o conteúdo empurrado para a esquerda da tela em `fracao` da largura dela (negativo,
 * para a direita). O desvio é medido na tela: com o mapa girado, vira outro eixo do desenho.
 */
export function desviar(v: Visao, fracao: number, giro = 0): Visao {
  const [dx, dy] = desgirar(fracao * v.w, 0, giro);
  return { ...v, x: v.x + dx, y: v.y + dy };
}

/** A tela não tem a proporção do alvo: a visão cresce para cobrir a tela sem cortar o alvo. */
export function cobrir(v: Visao, aspecto: number): Visao {
  const h = v.w / aspecto;
  if (h >= v.h) return { ...v, y: v.y - (h - v.h) / 2, h };
  const w = v.h * aspecto;
  return { x: v.x - (w - v.w) / 2, y: v.y, w, h: v.h };
}

/** O centro da tela nunca sai do campus: não dá para arrastar o mapa para o vazio. */
export function limitar(v: Visao): Visao {
  const cx = Math.min(LARGURA_DO_CAMPUS, Math.max(0, v.x + v.w / 2));
  const cy = Math.min(ALTURA_DO_CAMPUS, Math.max(0, v.y + v.h / 2));
  return { ...v, x: cx - v.w / 2, y: cy - v.h / 2 };
}

/** O mesmo ângulo, entre -180° e 180°: voltar para o norte gira pelo lado mais curto. */
export function normalizar(giro: number): number {
  const volta = 2 * Math.PI;
  return giro - volta * Math.round(giro / volta);
}

/**
 * Os seis números do `matrix()` da camada para a tela mostrar `v` girada em `giro` em torno do
 * centro. O `viewBox` do SVG fica parado em `base` (encaixado inteiro e centralizado); quem se
 * move é a camada dentro dele.
 */
export function matrizDaCamada(
  base: Visao,
  v: Visao,
  largura: number,
  altura: number,
  giro = 0,
): [number, number, number, number, number, number] {
  const m = Math.min(largura / base.w, altura / base.h);
  const a = largura / v.w / m;
  const c = a * Math.cos(giro);
  const s = a * Math.sin(giro);
  const cx = v.x + v.w / 2;
  const cy = v.y + v.h / 2;
  // O centro da visão cai no centro do viewBox, que é o centro da tela.
  return [
    c,
    s,
    -s,
    c,
    base.x + base.w / 2 - (c * cx - s * cy),
    base.y + base.h / 2 - (s * cx + c * cy),
  ];
}

/**
 * A câmera do mapa. Arrastar, pinçar, girar, a inércia e as animações escrevem o `transform` direto
 * no DOM, uma vez por quadro, sem passar pelo estado do React: redesenhar o SVG inteiro a cada
 * movimento do dedo era o que travava o mapa. `aoMudar` avisa a visão nova a cada quadro pintado.
 */
export function criarCamera(base: Visao, aoMudar: (v: Visao) => void) {
  let svg: SVGSVGElement | null = null;
  let camada: SVGGElement | null = null;
  let largura = 0;
  let altura = 0;
  /** O que está na tela agora, já na proporção dela. */
  let vista = base;
  /** O que se quer ver, antes de cobrir a tela: é o que vale quando a tela muda de tamanho. */
  let logica = base;
  /** Quanto o mapa está girado, em radianos (0 = norte para cima). */
  let giro = 0;
  let pintura = 0;
  let animacao = 0;
  let parado: ReturnType<typeof setTimeout> | undefined;
  /** Giro em que a animação do `irPara` em curso vai terminar; `null` sem animação. */
  let giroFinal: number | null = null;

  const dedos = new Map<number, { x: number; y: number }>();
  let inicio: { x: number; y: number } | null = null;
  let canto = { x: 0, y: 0 };
  let arrastou = false;
  let pincou = false;
  let giroDaPinca = 0;
  let vx = 0;
  let vy = 0;
  let ultimoMovimento = 0;

  const reduzir = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const pintar = () => {
    pintura = 0;
    if (!svg || !camada || largura === 0) return;
    const matriz = matrizDaCamada(base, vista, largura, altura, giro);
    camada.setAttribute('transform', `matrix(${matriz.map(String).join(' ')})`);
    // Na moldura do mapa, para o CSS dos nomes, dos contornos e da bússola: metros do desenho por
    // pixel da tela, e o giro em radianos.
    const moldura = svg.parentElement ?? svg;
    moldura.style.setProperty('--k', String(vista.w / largura));
    moldura.style.setProperty('--giro', String(giro));
    aoMudar(vista);
  };

  /** Pinta no próximo quadro e marca o mapa como "em movimento" (o CSS desliga o brilho caro). */
  const agendar = () => {
    if (svg) {
      svg.setAttribute('data-movendo', '');
      clearTimeout(parado);
      parado = setTimeout(() => svg?.removeAttribute('data-movendo'), 160);
    }
    if (!pintura) pintura = requestAnimationFrame(pintar);
  };

  const parar = () => {
    cancelAnimationFrame(animacao);
    animacao = 0;
    giroFinal = null;
  };

  /** Segue o dedo: muda na hora, sem animar. */
  const mover = (v: Visao) => {
    vista = v;
    logica = v;
    agendar();
  };

  /** A visão depois de arrastar o mapa `dx`, `dy` pixels na tela. */
  const deslocada = (dx: number, dy: number): Visao => {
    const [mx, my] = desgirar((dx / largura) * vista.w, (dy / altura) * vista.h, giro);
    return limitar({ ...vista, x: vista.x - mx, y: vista.y - my });
  };

  /** Leva a câmera até `alvo` (e ao giro pedido) com animação; sem ela para quem pediu menos movimento. */
  const irPara = (alvo: Visao, giroAlvo = giro) => {
    parar();
    logica = alvo;
    if (largura === 0) {
      vista = alvo;
      giro = giroAlvo;
      return;
    }
    const para = cobrir(alvo, largura / altura);
    if (reduzir()) {
      vista = para;
      giro = giroAlvo;
      agendar();
      return;
    }
    const de = vista;
    const giroDe = giro;
    giroFinal = giroAlvo;
    const comeco = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, Math.max(0, (agora - comeco) / DURACAO_MS));
      const e = 1 - (1 - t) ** 3;
      vista = {
        x: de.x + (para.x - de.x) * e,
        y: de.y + (para.y - de.y) * e,
        w: de.w + (para.w - de.w) * e,
        h: de.h + (para.h - de.h) * e,
      };
      giro = giroDe + (giroAlvo - giroDe) * e;
      agendar();
      if (t < 1) animacao = requestAnimationFrame(passo);
      else parar();
    };
    animacao = requestAnimationFrame(passo);
  };

  /** Depois de soltar o dedo, o mapa continua deslizando e para aos poucos. */
  const deslizar = () => {
    let antes = performance.now();
    const passo = (agora: number) => {
      // Um quadro atrasado (aba em segundo plano, celular engasgando) não vira um salto no mapa.
      const dt = Math.min(32, Math.max(0, agora - antes));
      antes = agora;
      mover(deslocada(vx * dt, vy * dt));
      const atrito = Math.exp(-dt / ATRITO_MS);
      vx *= atrito;
      vy *= atrito;
      animacao = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(passo) : 0;
    };
    animacao = requestAnimationFrame(passo);
  };

  /** Posição do ponteiro dentro do mapa, de 0 a 1. */
  const naTela = (clientX: number, clientY: number) => ({
    px: (clientX - canto.x) / largura,
    py: (clientY - canto.y) / altura,
  });

  const medirCanto = () => {
    const r = svg?.getBoundingClientRect();
    if (r) canto = { x: r.left, y: r.top };
  };

  const onPointerDown = (e: EventoDePonteiro<SVGSVGElement>) => {
    parar();
    medirCanto();
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    giroDaPinca = 0;
    if (dedos.size === 1) {
      arrastou = false;
      pincou = false;
      vx = 0;
      vy = 0;
      inicio = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerMove = (e: EventoDePonteiro<SVGSVGElement>) => {
    const antes = dedos.get(e.pointerId);
    if (!antes || !svg || largura === 0) return;
    if (!arrastou && inicio) {
      if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) < 4) return;
      // Só agora o ponteiro é capturado: antes disso, o clique continua chegando ao prédio.
      arrastou = true;
      svg.setPointerCapture(e.pointerId);
    }
    if (dedos.size >= 2) {
      pincou = true;
      const outro = [...dedos.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (!outro) return;
      const distAntes = Math.hypot(antes.x - outro.x, antes.y - outro.y);
      const distAgora = Math.hypot(e.clientX - outro.x, e.clientY - outro.y);
      if (distAntes > 0 && distAgora > 0) {
        const { px, py } = naTela((e.clientX + outro.x) / 2, (e.clientY + outro.y) / 2);
        let v = aproximar(vista, distAntes / distAgora, px, py, giro);
        // Quanto a linha entre os dois dedos girou desde o último movimento.
        const delta = normalizar(
          Math.atan2(e.clientY - outro.y, e.clientX - outro.x) -
            Math.atan2(antes.y - outro.y, antes.x - outro.x),
        );
        const jaGirava = Math.abs(giroDaPinca) > GIRO_MINIMO;
        giroDaPinca += delta;
        if (jaGirava) {
          v = girar(v, giro, delta, px, py);
          giro += delta;
        }
        mover(limitar(v));
      }
    } else {
      const dx = e.clientX - antes.x;
      const dy = e.clientY - antes.y;
      const agora = performance.now();
      const dt = Math.max(1, agora - ultimoMovimento);
      // Média móvel da velocidade (px/ms): é com ela que o mapa desliza ao soltar.
      vx = 0.7 * (dx / dt) + 0.3 * vx;
      vy = 0.7 * (dy / dt) + 0.3 * vy;
      ultimoMovimento = agora;
      mover(deslocada(dx, dy));
    }
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const soltar = (e: EventoDePonteiro<SVGSVGElement>) => {
    dedos.delete(e.pointerId);
    if (dedos.size > 0) return;
    inicio = null;
    const recente = performance.now() - ultimoMovimento < 80;
    if (arrastou && !pincou && recente && Math.hypot(vx, vy) > 0.15 && !reduzir()) deslizar();
  };

  /** Liga a câmera ao SVG e à camada que se move. Devolve a limpeza. */
  const ligar = (oSvg: SVGSVGElement, aCamada: SVGGElement) => {
    svg = oSvg;
    camada = aCamada;
    const observador = new ResizeObserver(([e]) => {
      if (!e || e.contentRect.width === 0 || e.contentRect.height === 0) return;
      largura = e.contentRect.width;
      altura = e.contentRect.height;
      // A tela mudou no meio de uma animação (celular virando, janela redimensionada): a animação
      // foi calculada para a proporção antiga e sobrescreveria a visão nova. Ela termina aqui, já
      // no destino.
      const destino = giroFinal;
      parar();
      if (destino !== null) giro = destino;
      vista = cobrir(logica, largura / altura);
      pintar();
    });
    observador.observe(oSvg);
    // A roda dá zoom onde o ponteiro está, como em qualquer mapa. A pinça do trackpad chega como
    // roda com Ctrl e passos pequenos, por isso o fator maior.
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      parar();
      medirCanto();
      const { px, py } = naTela(e.clientX, e.clientY);
      const passo = e.deltaY * (e.ctrlKey || e.metaKey ? 0.01 : 0.0015);
      mover(limitar(aproximar(vista, Math.exp(passo), px, py, giro)));
    };
    oSvg.addEventListener('wheel', roda, { passive: false });
    return () => {
      observador.disconnect();
      oSvg.removeEventListener('wheel', roda);
      parar();
      cancelAnimationFrame(pintura);
      clearTimeout(parado);
      pintura = 0;
      svg = null;
      camada = null;
    };
  };

  return {
    ligar,
    irPara,
    /**
     * Leva a câmera até `alvo`, mantendo o giro, com o alvo `fracao` da largura à esquerda do
     * centro da tela: é o que tira o prédio de trás do painel.
     */
    focar: (alvo: Visao, fracao = 0) => {
      irPara(desviar(alvo, fracao, giro));
    },
    /** Aproxima (`fator` < 1) ou afasta, com animação, em torno do centro da tela. */
    zoom: (fator: number) => {
      irPara(aproximar(vista, fator, 0.5, 0.5, giro));
    },
    /** Zoom em torno de onde o ponteiro está. */
    zoomNoPonteiro: (fator: number, clientX: number, clientY: number) => {
      if (largura === 0) return;
      medirCanto();
      const { px, py } = naTela(clientX, clientY);
      irPara(aproximar(vista, fator, px, py, giro));
    },
    /** Gira o mapa `delta` radianos em torno do centro da tela, com animação. */
    girar: (delta: number) => {
      irPara(vista, giro + delta);
    },
    /** Volta o norte para cima, pelo lado mais curto. */
    norte: () => {
      giro = normalizar(giro);
      irPara(vista, 0);
    },
    /** Se o último toque virou arraste: o clique que vem no fim dele não conta. */
    arrastou: () => arrastou,
    eventos: { onPointerDown, onPointerMove, onPointerUp: soltar, onPointerCancel: soltar },
  };
}
