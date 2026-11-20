/**
 * O campus atrás das páginas internas (SCRUM-374): a mesma noite da home, com uma câmera que cada
 * página aponta. Lido do DOM por atributos `data-*`, escrito direto em `style`, num laço só.
 *
 * - `leitura` (Conquistas, Atividade): o item que passa pela linha de leitura (`[data-foco]`) fica
 *   `atual`, o prédio dele (`data-predio`) acende na cor dele (`data-cor`) e o rótulo
 *   (`data-rotulo`) aparece em cima do prédio. No celular o campus é uma janela fixa no alto.
 * - `passeio` (Manual): o campus anda devagar com a leitura, sem tirar o foco do texto.
 *
 * Com "menos movimento" a câmera pula direto para o ponto, sem deslizar.
 */
import { limitar, mistura, type Camera } from '../home/cinema';

type Vista = Omit<Camera, 'veu'>;

const PERTO = 0.02;

export function ligarFundo(raiz: HTMLElement): () => void {
  const consultaCelular = matchMedia('(max-width: 720px)');
  const consultaParado = matchMedia('(prefers-reduced-motion: reduce)');
  const plano = raiz.querySelector<HTMLElement>('[data-plano]');
  const cenario = raiz.querySelector<HTMLElement>('[data-cenario]');
  const rotulo = raiz.querySelector<HTMLElement>('[data-rotulo]');
  const mapa = plano?.querySelector('svg');
  if (!plano || !cenario || !mapa) return () => undefined;
  const vb = mapa.viewBox.baseVal;
  const passeio = raiz.dataset.fundo === 'passeio';

  // Altura da tela que não pula quando a barra do navegador do celular aparece ou some (100svh).
  const sonda = document.createElement('div');
  sonda.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
  raiz.append(sonda);

  const predios = new Map(
    [...mapa.querySelectorAll<SVGPathElement>('[data-predio]')].map((el) => [
      el.dataset.predio ?? '',
      el,
    ]),
  );
  const itens = [...raiz.querySelectorAll<HTMLElement>('[data-foco]')].map((el) => ({
    el,
    predio: predios.get(el.dataset.predio ?? ''),
  }));
  // Os prédios que aparecem na página ficam meio acesos; o do item atual acende inteiro.
  for (const { el, predio } of itens) {
    if (!predio) continue;
    predio.classList.add('meia');
    predio.style.setProperty('--cor', el.dataset.cor ?? '#5f6496');
  }
  const caixas = new Map<SVGGraphicsElement, DOMRect>();
  const caixa = (el: SVGGraphicsElement) => {
    let b = caixas.get(el);
    if (!b) {
      b = el.getBBox();
      caixas.set(el, b);
    }
    return b;
  };

  let celular = consultaCelular.matches;
  let parado = consultaParado.matches;
  let W = innerWidth;
  let H = innerHeight;
  let K = 1;
  let OX = 0;
  let OY = 0;
  let topo = 0;
  let janela = 0;
  let forcar = true;
  const ponto = (sx: number, sy: number): [number, number] => [
    (sx - vb.x) * K + OX,
    (sy - vb.y) * K + OY,
  ];
  const meio = () => ponto(vb.x + vb.width / 2, vb.y + vb.height / 2);
  const centroDe = (el: SVGGraphicsElement) => {
    const b = caixa(el);
    return ponto(b.x + b.width / 2, b.y + b.height / 2);
  };
  const E = (
    [fx, fy]: [number, number],
    x: number,
    y: number,
    rx: number,
    rz: number,
    s: number,
    op: number,
  ): Vista => ({ fx, fy, x, y, rx, rz, s, op });

  const medir = () => {
    celular = consultaCelular.matches;
    parado = consultaParado.matches;
    W = innerWidth;
    H = sonda.offsetHeight || innerHeight;
    K = Math.min(plano.offsetWidth / vb.width, plano.offsetHeight / vb.height);
    OX = (plano.offsetWidth - vb.width * K) / 2;
    OY = (plano.offsetHeight - vb.height * K) / 2;
    topo = document.querySelector('header')?.offsetHeight ?? 0;
    // A janela do campus no celular: a altura vem do CSS (`--janela`).
    janela =
      celular && !passeio
        ? parseFloat(getComputedStyle(raiz).getPropertyValue('--janela-px')) || H * 0.27
        : 0;
    forcar = true;
  };

  let atual: (typeof itens)[number] | null = null;
  const escolher = () => {
    // A linha de leitura: no meio da tela; no celular, logo abaixo da janela do campus.
    const linha = celular ? topo + janela + (H - topo - janela) * 0.38 : H * 0.5;
    let melhor: typeof atual = null;
    let menor = Infinity;
    for (const it of itens) {
      const r = it.el.getBoundingClientRect();
      if (r.bottom < topo + janela || r.top > H) continue;
      const d = Math.abs(r.top + r.height / 2 - linha);
      if (d < menor) {
        menor = d;
        melhor = it;
      }
    }
    if (scrollY < 80) melhor = null;
    if (melhor === atual) return;
    atual?.el.classList.remove('atual');
    atual?.predio?.classList.remove('luz');
    atual = melhor;
    if (!atual) return;
    atual.el.classList.add('atual');
    if (atual.predio) {
      atual.predio.style.setProperty('--cor', atual.el.dataset.cor ?? '#5f6496');
      atual.predio.classList.add('luz');
    }
    if (rotulo) {
      rotulo.textContent = atual.el.dataset.rotulo ?? '';
      rotulo.style.setProperty('--c', atual.el.dataset.cor ?? '');
    }
  };

  const alvo = (): Vista => {
    const meioDaJanela = topo + janela * 0.56;
    if (passeio) {
      const p = scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
      return celular
        ? E(meio(), W * 0.5, H * mistura(0.8, 0.4, p), 55, mistura(-24, 4, p), 0.9, 0.4)
        : E(meio(), W * 0.86, H * mistura(0.75, 0.45, p), 55, mistura(-24, 4, p), 1.2, 0.5);
    }
    if (atual?.predio)
      return celular
        ? E(centroDe(atual.predio), W * 0.5, meioDaJanela, 30, -8, 2.1, 1)
        : E(centroDe(atual.predio), W * 0.76, H * 0.5, 34, -8, 2.5, 0.95);
    return celular
      ? E(meio(), W * 0.5, meioDaJanela + 10, 50, -16, 0.75, 1)
      : E(meio(), W * 0.7, H * 0.62, 52, -18, 1.25, 0.75);
  };

  let vista: Vista | null = null;
  let ultimoY = -1;
  let quadro = 0;
  const desenhar = () => {
    quadro = requestAnimationFrame(desenhar);
    const y = scrollY;
    if (y !== ultimoY || forcar) {
      ultimoY = y;
      escolher();
    }
    const destino = alvo();
    const antes = vista;
    const t = parado || !antes ? 1 : 0.12;
    const proximo: Vista = antes
      ? (Object.fromEntries(
          Object.entries(destino).map(([k, v]) => [k, mistura(antes[k as keyof Vista], v, t)]),
        ) as unknown as Vista)
      : destino;
    vista = proximo;
    const parada =
      antes &&
      (Object.keys(proximo) as (keyof Vista)[]).every(
        (k) => Math.abs(proximo[k] - antes[k]) < PERTO,
      );
    if (parada && !forcar) return;
    forcar = false;
    const v = proximo;
    plano.style.transformOrigin = `${v.fx.toFixed(1)}px ${v.fy.toFixed(1)}px`;
    plano.style.transform = `translate(${(v.x - v.fx).toFixed(1)}px, ${(v.y - v.fy).toFixed(1)}px) rotateX(${v.rx.toFixed(2)}deg) rotateZ(${v.rz.toFixed(2)}deg) scale(${v.s.toFixed(4)})`;
    cenario.style.opacity = v.op.toFixed(3);
    // O rótulo segue o prédio aceso, depois que a câmera anda.
    if (!rotulo) return;
    const predio = atual?.predio;
    if (!predio || !atual?.el.dataset.rotulo) {
      rotulo.style.opacity = '0';
      return;
    }
    const b = predio.getBoundingClientRect();
    rotulo.style.left = `${limitar(b.left + b.width / 2, 110, W - 110).toFixed(1)}px`;
    rotulo.style.top = `${(celular ? Math.max(topo + 46, b.top) : b.top).toFixed(1)}px`;
    rotulo.style.opacity = '1';
  };

  let agendado = 0;
  const aoMudarTamanho = () => {
    cancelAnimationFrame(agendado);
    agendado = requestAnimationFrame(medir);
  };
  const aoRedimensionar = () => {
    if (innerWidth !== W || Math.abs((sonda.offsetHeight || innerHeight) - H) > 1) aoMudarTamanho();
  };
  addEventListener('resize', aoRedimensionar);
  consultaCelular.addEventListener('change', aoMudarTamanho);
  consultaParado.addEventListener('change', aoMudarTamanho);
  medir();
  raiz.dataset.ligado = '';
  quadro = requestAnimationFrame(desenhar);
  void document.fonts.ready.then(medir);

  return () => {
    cancelAnimationFrame(quadro);
    cancelAnimationFrame(agendado);
    removeEventListener('resize', aoRedimensionar);
    consultaCelular.removeEventListener('change', aoMudarTamanho);
    consultaParado.removeEventListener('change', aoMudarTamanho);
    sonda.remove();
    delete raiz.dataset.ligado;
  };
}
