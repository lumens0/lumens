/**
 * O motor das cenas da home (SCRUM-374). A página chega pronta do servidor; isto só liga o
 * movimento: a câmera sobre o campus fixo atrás da página, as luzes dos prédios, o texto que acende,
 * o medidor da pauta em destaque e o carrossel. Tudo é lido do DOM por atributos `data-*` e escrito
 * direto em `style`, num laço só por quadro, sem passar pelo estado do React.
 *
 * - Computador: cada cena fica presa na tela enquanto a rolagem conta a história dela.
 * - Celular: as mesmas cenas, com outro enquadramento; o carrossel é arrastado com o dedo.
 * - "Menos movimento" e sem JavaScript: cada cena é uma tela parada, já montada.
 */

export const limitar = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const fase = (p: number, a: number, b: number) => limitar((p - a) / (b - a));
export const suave = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const mistura = (a: number, b: number, t: number) => a + (b - a) * t;

/** Um ponto do campus (fx, fy, em px do plano) vai para um ponto da tela (x, y), com giro e escala. */
export interface Camera {
  fx: number;
  fy: number;
  x: number;
  y: number;
  rx: number;
  rz: number;
  s: number;
  op: number;
  veu: number;
}

export function misturarCameras(a: Camera, b: Camera, t: number): Camera {
  return {
    fx: mistura(a.fx, b.fx, t),
    fy: mistura(a.fy, b.fy, t),
    x: mistura(a.x, b.x, t),
    y: mistura(a.y, b.y, t),
    rx: mistura(a.rx, b.rx, t),
    rz: mistura(a.rz, b.rz, t),
    s: mistura(a.s, b.s, t),
    op: mistura(a.op, b.op, t),
    veu: mistura(a.veu, b.veu, t),
  };
}

/**
 * Progresso (0 a 1) de uma cena. Cena presa: quanto já se rolou dela. Cena solta (mais baixa que a
 * tela, no celular): quanto ela já atravessou a tela.
 */
export function progressoDaCena(y: number, topo: number, altura: number, tela: number): number {
  return altura > tela * 1.1
    ? limitar((y - topo) / (altura - tela))
    : limitar((y - topo + tela) / (altura + tela));
}

/**
 * Onde a pauta `j` de `n` fica parada no centro do carrossel em 3D, de 0 a 1 da cena. Cada pauta
 * para um pouco (o trecho entre 0,3 e 0,85 de cada passo é a passagem para a próxima).
 */
export function progressoDaPauta(j: number, n: number): number {
  return n < 2 ? 0.04 : 0.04 + (Math.min(j + 0.1, n - 1) / (n - 1)) * 0.92;
}

/** O inverso: com a cena em `p`, a posição (fracionária) do carrossel. */
export function posicaoNoCarrossel(p: number, n: number): number {
  const t = fase(p, 0.04, 0.96) * Math.max(0, n - 1);
  const k = Math.floor(t);
  const f = t - k;
  return k >= n - 1 ? n - 1 : k + suave(fase(f, 0.3, 0.85));
}

type Nome = 'abertura' | 'manifesto' | 'destaque' | 'pautas' | 'numeros' | 'fim';

/** Ponto de cada cena em que ela já está montada: é para lá que o HUD leva. */
const REPOUSO: Record<Nome, number> = {
  abertura: 0,
  manifesto: 0.92,
  destaque: 0.88,
  pautas: 0.04,
  numeros: 0,
  fim: 0.75,
};

const todos = <T extends Element>(raiz: ParentNode, seletor: string) => [
  ...raiz.querySelectorAll<T>(seletor),
];

export function ligarCinema(raiz: HTMLElement): () => void {
  const consultaCelular = matchMedia('(max-width: 720px)');
  const consultaParado = matchMedia('(prefers-reduced-motion: reduce)');
  let celular = consultaCelular.matches;
  let parado = consultaParado.matches;
  const nativo = () => celular || parado;

  const plano = raiz.querySelector<HTMLElement>('[data-plano]');
  const cenario = raiz.querySelector<HTMLElement>('[data-cenario]');
  const veu = raiz.querySelector<HTMLElement>('[data-veu]');
  const mapa = plano?.querySelector('svg');
  if (!plano || !cenario || !veu || !mapa) return () => undefined;
  const vb = mapa.viewBox.baseVal;

  // Altura da tela que não pula quando a barra do navegador do celular aparece ou some (100svh).
  const sonda = document.createElement('div');
  sonda.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
  raiz.append(sonda);

  const caixas = new Map<SVGGraphicsElement, DOMRect>();
  const caixa = (el: SVGGraphicsElement) => {
    let b = caixas.get(el);
    if (!b) {
      b = el.getBBox();
      caixas.set(el, b);
    }
    return b;
  };
  const luzes = todos<SVGPathElement>(mapa, '[data-luz]');
  const predioPorId = new Map(
    todos<SVGPathElement>(mapa, '[data-predio]').map((el) => [el.dataset.predio ?? '', el]),
  );

  const cenas = todos<HTMLElement>(raiz, '[data-cena]');
  const nomeDe = (el: HTMLElement) => el.dataset.cena as Nome;

  let W = innerWidth;
  let H = innerHeight;
  let K = 1;
  let OX = 0;
  let OY = 0;
  let MEIO: [number, number] = [0, 0];
  let geo: { top: number; h: number }[] = [];
  let forcar = true;
  const ponto = (sx: number, sy: number): [number, number] => [
    (sx - vb.x) * K + OX,
    (sy - vb.y) * K + OY,
  ];
  const centroDe = (el: SVGGraphicsElement) => {
    const b = caixa(el);
    return ponto(b.x + b.width / 2, b.y + b.height / 2);
  };

  // --- Cenas -------------------------------------------------------------------------------------

  // A: o título sai em camadas, os pinos flutuam acima dos prédios que acendem.
  const linhas = todos<HTMLElement>(raiz, '[data-linha]');
  const contadores = raiz.querySelector<HTMLElement>('[data-contadores]');
  const pinos = raiz.querySelector<HTMLElement>('[data-pinos]');
  const pinosEl = todos<HTMLElement>(raiz, '[data-pino]').map((el) => ({
    el,
    predio: predioPorId.get(el.dataset.pino ?? ''),
  }));
  const cenaAbertura = (p: number) => {
    pinosEl.forEach(({ el, predio }) => {
      if (!predio || parado) {
        el.style.opacity = '0';
        return;
      }
      const r = predio.getBoundingClientRect();
      const cabe = celular
        ? r.top > H * 0.42 && r.top < H - 190 && r.left > 40 && r.left < W - 40
        : r.top > 170 && r.top < H - 190 && r.left > 140 && r.left < W - 80;
      el.style.left = `${(r.left + r.width / 2).toFixed(1)}px`;
      el.style.top = `${(r.top - 6 - p * 50).toFixed(1)}px`;
      el.style.opacity =
        predio.classList.contains('luz') && cabe ? String(1 - fase(p, 0.82, 0.96)) : '0';
    });
    const passo = celular ? 0.45 : 1;
    linhas.forEach((l, k) => {
      l.style.transform = `translateY(${(-fase(p, 0.12, 1) * (620 - k * 170) * passo).toFixed(1)}px)`;
      l.style.opacity = String(1 - fase(p, 0.36 + k * 0.06, 0.56 + k * 0.06));
    });
    if (contadores) contadores.style.opacity = String(1 - fase(p, 0.8, 0.95));
  };

  // B: as palavras acendem na ordem da leitura.
  const palavras = todos<HTMLElement>(raiz, '[data-palavra]');
  const cenaManifesto = (p: number) => {
    const n = fase(p, 0.08, 0.86) * palavras.length;
    palavras.forEach((s, k) => s.classList.toggle('acesa', k < n));
  };

  // C: a pauta em destaque: os apoios sobem, as etapas já feitas acendem uma a uma.
  const medidor = raiz.querySelector<HTMLElement>('[data-medidor]');
  const apoiosAnimados = raiz.querySelector<HTMLElement>('[data-apoios-animado]');
  const passos = todos<HTMLElement>(raiz, '[data-passo]');
  const feitosDestaque = passos.filter((li) => li.dataset.feito !== undefined).length;
  const ficha = raiz.querySelector<HTMLElement>('[data-ficha]');
  const numero = raiz.querySelector<HTMLElement>('[data-numero]');
  const proxima = raiz.querySelector<HTMLElement>('[data-proxima-etapa]');
  const formatar = new Intl.NumberFormat('pt-BR');
  const cenaDestaque = (p: number) => {
    if (apoiosAnimados && medidor) {
      const valor = Number(apoiosAnimados.dataset.valor ?? 0);
      const teto = Number(medidor.dataset.teto ?? 1);
      const a = valor * suave(fase(p, 0.12, 0.7));
      apoiosAnimados.textContent = formatar.format(Math.round(a));
      medidor.style.setProperty('--m', ((a / teto) * 100).toFixed(2));
    }
    const acesos = Math.max(1, Math.round(fase(p, 0.12, 0.8) * feitosDestaque));
    let cor = '';
    passos.forEach((li, k) => {
      const feito = li.dataset.feito !== undefined && k < acesos;
      li.classList.toggle('feito', feito);
      if (feito) cor = li.dataset.cor ?? cor;
    });
    if (medidor && cor) medidor.style.setProperty('--c', cor);
    const entra = suave(fase(p, 0.02, 0.16));
    if (ficha) {
      ficha.style.transform = celular
        ? `translateY(${((1 - entra) * 40).toFixed(1)}px)`
        : `translateX(${((1 - entra) * 120).toFixed(1)}px)`;
      ficha.style.opacity = String(entra);
    }
    if (numero)
      numero.style.transform = `translateY(${((1 - entra) * (celular ? 30 : 80) - p * (celular ? 10 : 40)).toFixed(1)}px)`;
    if (proxima) {
      const e = fase(p, 0.8, 0.86);
      proxima.style.opacity = String(e);
      proxima.style.transform = `translateY(${((1 - e) * 12).toFixed(1)}px)`;
    }
  };

  // D: todas as pautas. Computador: carrossel em 3D levado pela rolagem. Celular: faixa arrastável.
  const carrossel = raiz.querySelector<HTMLElement>('[data-carrossel]');
  const cartoes = todos<HTMLElement>(raiz, '[data-cartao]');
  const posicao = raiz.querySelector<HTMLElement>('[data-posicao]');
  let foco = 0;
  const mostrarFoco = () => {
    if (posicao)
      posicao.textContent = `${String(foco + 1).padStart(2, '0')} / ${String(cartoes.length).padStart(2, '0')}`;
    cartoes.forEach((c, j) => c.classList.toggle('foco', j === foco));
  };
  const passoDaFaixa = () => (cartoes[0] ? cartoes[0].offsetWidth + 12 : 1);
  const cenaPautas = (p: number) => {
    if (nativo()) return;
    const n = cartoes.length;
    const idx = posicaoNoCarrossel(p, n);
    const novo = Math.round(idx);
    if (novo !== foco) {
      foco = novo;
      mostrarFoco();
    }
    const entra = suave(fase(p, 0, 0.04));
    cartoes.forEach((c, j) => {
      const d = j - idx;
      const ad = Math.abs(d);
      c.style.transform = `translateX(${(d * 430 + (1 - entra) * (500 + j * 120)).toFixed(1)}px) translateZ(${(-ad * 160).toFixed(1)}px) rotateY(${(limitar(d, -1.6, 1.6) * -18).toFixed(2)}deg)`;
      // As do lado ficam um pouco apagadas, mas legíveis; as de longe somem.
      c.style.opacity = (
        (ad < 1.5 ? mistura(1, 0.72, limitar(ad)) : limitar(1 - (ad - 1.5) * 2)) * entra
      ).toFixed(3);
      c.style.zIndex = String(100 - Math.round(ad * 10));
    });
  };
  const limparCarrossel = () => {
    cartoes.forEach((c) => {
      c.style.transform = '';
      c.style.opacity = '';
      c.style.zIndex = '';
    });
  };

  // E: os painéis dos números chegam em escada quando entram na tela.
  const subir = todos<HTMLElement>(raiz, '[data-subir]');
  const cenaNumeros = () => {
    subir.forEach((el, k) => {
      const r = el.getBoundingClientRect();
      const e = parado ? 1 : suave(limitar((H - r.top) / (H * 0.3) - k * 0.15));
      el.style.opacity = e.toFixed(3);
      el.style.transform = `translateY(${((1 - e) * 40).toFixed(1)}px)`;
    });
  };

  // F: o letreiro sobe de dentro da linha.
  const letreiro = todos<HTMLElement>(raiz, '[data-linha-fim]');
  const acao = raiz.querySelector<HTMLElement>('[data-acao]');
  const cenaFim = (p: number) => {
    letreiro.forEach((l, k) => {
      l.style.transform = `translateY(${((1 - suave(fase(p, 0.08 + k * 0.1, 0.36 + k * 0.1))) * 110).toFixed(1)}%)`;
    });
    if (acao) {
      acao.style.opacity = String(fase(p, 0.45, 0.6));
      acao.style.transform = `translateY(${((1 - fase(p, 0.45, 0.6)) * 20).toFixed(1)}px)`;
    }
  };

  const CENAS: Record<Nome, (p: number) => void> = {
    abertura: cenaAbertura,
    manifesto: cenaManifesto,
    destaque: cenaDestaque,
    pautas: cenaPautas,
    numeros: cenaNumeros,
    fim: cenaFim,
  };

  // --- Câmera e luzes ------------------------------------------------------------------------------

  const E = (
    [fx, fy]: [number, number],
    x: number,
    y: number,
    rx: number,
    rz: number,
    s: number,
    op: number,
    veuOp: number,
  ): Camera => ({ fx, fy, x, y, rx, rz, s, op, veu: veuOp });
  const foco0 = predioPorId.get(raiz.dataset.foco ?? '');
  const secaoDestaque = cenas.find((c) => nomeDe(c) === 'destaque');
  const alvoDestaque = predioPorId.get(secaoDestaque?.dataset.alvo ?? '');
  const predioDoFoco = () => predioPorId.get(cartoes[foco]?.dataset.predio ?? '');
  const CAMERAS_PC: Record<Nome, (p: number) => Camera> = {
    abertura: (p) => {
      const v = suave(fase(p, 0.2, 0.95));
      if (foco0)
        return E(
          centroDe(foco0),
          W * 0.66,
          H * mistura(0.68, 0.56, v),
          mistura(52, 26, v),
          mistura(-22, -10, v),
          mistura(1.9, 2.3, v),
          1,
          0,
        );
      return E(
        MEIO,
        W * 0.64,
        H * mistura(0.74, 0.56, v),
        mistura(62, 26, v),
        mistura(-26, -10, v),
        mistura(1.25, 1.55, v),
        1,
        0,
      );
    },
    manifesto: (p) =>
      E(
        MEIO,
        W * 0.62,
        H * 0.55,
        mistura(26, 14, p),
        mistura(-10, 8, p),
        mistura(1.5, 1.8, p),
        0.38,
        0.25,
      ),
    destaque: (p) =>
      alvoDestaque
        ? E(
            centroDe(alvoDestaque),
            W * 0.47,
            H * 0.56,
            0,
            mistura(-4, 4, p),
            mistura(3.2, 3.6, p),
            0.95,
            0.4,
          )
        : E(MEIO, W * 0.6, H * 0.6, 40, -10, 1.3, 0.5, 0.4),
    pautas: () => {
      const pr = predioDoFoco();
      return pr
        ? E(centroDe(pr), W * 0.5, H * 0.36, 30, -6, 2.6, 0.95, 0.35)
        : E(MEIO, W * 0.5, H * 0.45, 40, -10, 1.15, 0.9, 0.35);
    },
    numeros: (p) => E(MEIO, W * 0.42, H * 0.62, 52, mistura(-18, -8, p), 1.25, 0.24, 0.5),
    fim: (p) => {
      const v = suave(fase(p, 0, 0.7));
      return E(MEIO, W * 0.62, H * mistura(1.15, 0.86, v), 58, -14, 1.3, 0.85, 0);
    },
  };
  const CAMERAS_CELULAR: Record<Nome, (p: number) => Camera> = {
    abertura: (p) => {
      const v = suave(fase(p, 0.2, 0.95));
      if (foco0)
        return E(
          centroDe(foco0),
          W * 0.56,
          H * mistura(0.7, 0.62, v),
          mistura(52, 34, v),
          mistura(-24, -14, v),
          mistura(1.6, 2, v),
          1,
          0.1,
        );
      return E(
        MEIO,
        W * 0.56,
        H * mistura(0.78, 0.64, v),
        mistura(62, 36, v),
        mistura(-28, -14, v),
        mistura(0.9, 1.2, v),
        1,
        0.1,
      );
    },
    manifesto: (p) =>
      E(
        MEIO,
        W * 0.5,
        H * 0.5,
        mistura(32, 18, p),
        mistura(-10, 8, p),
        mistura(1.1, 1.3, p),
        0.45,
        0.25,
      ),
    destaque: (p) =>
      alvoDestaque
        ? E(
            centroDe(alvoDestaque),
            W * 0.72,
            H * 0.27,
            18,
            mistura(-6, 4, p),
            mistura(2.3, 2.6, p),
            0.95,
            0.35,
          )
        : E(MEIO, W * 0.5, H * 0.3, 40, -10, 1, 0.5, 0.35),
    pautas: () => {
      const pr = predioDoFoco();
      return pr
        ? E(centroDe(pr), W * 0.5, H * 0.2, 34, -8, 2, 0.9, 0.3)
        : E(MEIO, W * 0.5, H * 0.3, 44, -12, 0.95, 0.85, 0.3);
    },
    numeros: (p) => E(MEIO, W * 0.5, H * 0.72, 52, mistura(-18, -8, p), 1, 0.3, 0.5),
    fim: (p) => {
      const v = suave(fase(p, 0, 0.7));
      return E(MEIO, W * 0.56, H * mistura(1.12, 0.9, v), 58, -14, 1.05, 0.85, 0);
    },
  };
  const ACENDER: Record<Nome, (p: number) => void> = {
    abertura: (p) => {
      const n = fase(p, 0.04, 0.5) * luzes.length;
      luzes.forEach((el, k) => el.classList.toggle('luz', parado || n > k + 0.3 || el === foco0));
    },
    manifesto: () => {
      luzes.forEach((el) => {
        el.classList.add('luz');
      });
    },
    destaque: () => {
      luzes.forEach((el) => el.classList.toggle('luz', !alvoDestaque || el === alvoDestaque));
    },
    pautas: () => {
      const pr = predioDoFoco();
      const etapa = cartoes[foco]?.dataset.etapa;
      luzes.forEach((el) =>
        el.classList.toggle('luz', !pr || el === pr || el.dataset.etapa === etapa),
      );
    },
    numeros: () => {
      luzes.forEach((el) => {
        el.classList.add('luz');
      });
    },
    fim: () => {
      luzes.forEach((el) => {
        el.classList.add('luz');
      });
    },
  };

  const medir = () => {
    const eraNativo = nativo();
    celular = consultaCelular.matches;
    parado = consultaParado.matches;
    raiz.dataset.cinema = parado ? 'parado' : 'ligado';
    raiz.toggleAttribute('data-celular', celular);
    W = innerWidth;
    H = sonda.offsetHeight || innerHeight;
    const PW = plano.offsetWidth;
    const PH = plano.offsetHeight;
    K = Math.min(PW / vb.width, PH / vb.height);
    OX = (PW - vb.width * K) / 2;
    OY = (PH - vb.height * K) / 2;
    MEIO = ponto(vb.x + vb.width / 2, vb.y + vb.height / 2);
    geo = cenas.map((s) => {
      const r = s.getBoundingClientRect();
      return { top: r.top + scrollY, h: r.height };
    });
    if (nativo() && !eraNativo) limparCarrossel();
    if (nativo() && carrossel) carrossel.scrollLeft = foco * passoDaFaixa();
    // Com menos movimento nada é escrito nas cenas: o CSS mostra cada uma parada e já montada, com
    // os valores finais que vieram do servidor.
    forcar = true;
  };

  // --- Laço ---------------------------------------------------------------------------------------

  let vista: Camera | null = null;
  let ultimoY = -1;
  let quadro = 0;
  const passo = () => {
    quadro = requestAnimationFrame(passo);
    const y = scrollY;
    const rolou = y !== ultimoY;
    ultimoY = y;
    const ps = geo.map(({ top, h }) => progressoDaCena(y, top, h, H));
    const cameras = celular ? CAMERAS_CELULAR : CAMERAS_PC;
    let alvo: Camera;
    let ativa: Nome = 'abertura';
    let pAtiva = 0;
    if (parado) {
      alvo = E(MEIO, W * (celular ? 0.55 : 0.64), H * 0.62, 50, -16, celular ? 1 : 1.4, 0.45, 0.35);
      ativa = 'numeros';
    } else {
      alvo = cameras.abertura(0);
      for (let i = 0; i < geo.length; i++) {
        const g = geo[i];
        const cena = cenas[i];
        if (!g || !cena) break;
        const top = g.top - y;
        const bottom = top + g.h;
        const nome = nomeDe(cena);
        if (top > 0) break;
        if (bottom > H) {
          alvo = cameras[nome](ps[i] ?? 0);
          ativa = nome;
          pAtiva = ps[i] ?? 0;
          break;
        }
        const seguinte = cenas[i + 1];
        if (seguinte && bottom > 0) {
          const t = suave(limitar(1 - bottom / H));
          alvo = misturarCameras(cameras[nome](1), cameras[nomeDe(seguinte)](0), t);
          ativa = t < 0.5 ? nome : nomeDe(seguinte);
          pAtiva = t < 0.5 ? 1 : 0;
          break;
        }
        alvo = cameras[nome](1);
        ativa = nome;
        pAtiva = 1;
      }
    }
    const antes = vista;
    vista = vista && !parado ? misturarCameras(vista, alvo, 0.16) : alvo;
    const quieta =
      antes !== null &&
      Math.abs(vista.x - antes.x) +
        Math.abs(vista.y - antes.y) +
        Math.abs(vista.s - antes.s) * 100 +
        Math.abs(vista.rx - antes.rx) +
        Math.abs(vista.rz - antes.rz) <
        0.05;
    if (!rolou && quieta && !forcar) return;
    forcar = false;
    const v = vista;
    plano.style.transformOrigin = `${v.fx.toFixed(1)}px ${v.fy.toFixed(1)}px`;
    plano.style.transform = `translate(${(v.x - v.fx).toFixed(1)}px, ${(v.y - v.fy).toFixed(1)}px) rotateX(${v.rx.toFixed(2)}deg) rotateZ(${v.rz.toFixed(2)}deg) scale(${v.s.toFixed(4)})`;
    cenario.style.opacity = v.op.toFixed(3);
    veu.style.opacity = v.veu.toFixed(3);
    ACENDER[ativa](pAtiva);
    // Os pinos são da abertura: em qualquer outra cena, somem (mesmo quando o HUD pula direto).
    if (pinos) pinos.style.opacity = ativa === 'abertura' && !parado ? '1' : '0';
    if (parado) return;
    geo.forEach(({ top, h }, i) => {
      const cena = cenas[i];
      if (cena && y + H > top - H * 0.5 && y < top + h + H * 0.5) CENAS[nomeDe(cena)](ps[i] ?? 0);
    });
  };

  // --- Navegação -----------------------------------------------------------------------------------

  const secaoDasPautas = cenas.find((c) => nomeDe(c) === 'pautas');
  const irParaPauta = (j: number) => {
    const i = secaoDasPautas ? cenas.indexOf(secaoDasPautas) : -1;
    const g = geo[i];
    if (!g || !carrossel) return;
    const comportamento: ScrollBehavior = parado ? 'auto' : 'smooth';
    if (nativo()) {
      carrossel.scrollTo({ left: j * passoDaFaixa(), behavior: comportamento });
      return;
    }
    scrollTo({
      top: g.top + progressoDaPauta(j, cartoes.length) * (g.h - H),
      behavior: comportamento,
    });
  };
  const anterior = raiz.querySelector('[data-anterior]');
  const proximaPauta = raiz.querySelector('[data-proxima]');
  const aoAnterior = () => {
    irParaPauta(Math.max(0, foco - 1));
  };
  const aoProxima = () => {
    irParaPauta(Math.min(cartoes.length - 1, foco + 1));
  };
  anterior?.addEventListener('click', aoAnterior);
  proximaPauta?.addEventListener('click', aoProxima);
  const aoRolarFaixa = () => {
    if (!nativo() || !carrossel) return;
    const j = Math.round(limitar(carrossel.scrollLeft / passoDaFaixa(), 0, cartoes.length - 1));
    if (j !== foco) {
      foco = j;
      mostrarFoco();
      forcar = true;
    }
  };
  carrossel?.addEventListener('scroll', aoRolarFaixa, { passive: true });
  // Teclado: o cartão que recebe o foco vai para o centro, para não ficar escondido de lado.
  const aoFocar = (e: Event) => {
    const j = cartoes.findIndex((c) => c.contains(e.target as Node));
    if (j >= 0 && j !== foco) irParaPauta(j);
  };
  carrossel?.addEventListener('focusin', aoFocar);
  // HUD: leva ao ponto da cena em que ela já está montada.
  const aoIr = (e: Event) => {
    const id = (e as CustomEvent<string>).detail;
    const i = cenas.findIndex((c) => c.id === id);
    const g = geo[i];
    const cena = cenas[i];
    if (!g || !cena) return;
    e.preventDefault();
    const presa = g.h > H * 1.1 && !parado;
    // Cena solta começa logo abaixo do cabeçalho fixo, e não atrás dele.
    const cabecalho = document.querySelector('header')?.offsetHeight ?? 0;
    let alvoY = presa ? g.top + REPOUSO[nomeDe(cena)] * (g.h - H) : g.top - cabecalho;
    // No carrossel arrastável, desce o bastante para os botões dele ficarem acima do HUD.
    if (nomeDe(cena) === 'pautas' && nativo()) {
      const botoes = raiz.querySelector('[data-navegacao]')?.getBoundingClientRect();
      const hud = document
        .querySelector('[aria-label="Partes da página"]')
        ?.getBoundingClientRect();
      if (botoes && hud) {
        const fundoDosBotoes = botoes.bottom + scrollY - g.top + cabecalho;
        alvoY += Math.max(0, fundoDosBotoes - hud.top + 12);
      }
    }
    scrollTo({ top: alvoY, behavior: parado ? 'auto' : 'smooth' });
  };
  addEventListener('lumens:ir', aoIr);

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
  void document.fonts.ready.then(aoMudarTamanho);
  medir();
  mostrarFoco();
  if (nativo()) limparCarrossel();
  quadro = requestAnimationFrame(passo);

  return () => {
    cancelAnimationFrame(quadro);
    cancelAnimationFrame(agendado);
    removeEventListener('resize', aoRedimensionar);
    removeEventListener('lumens:ir', aoIr);
    consultaCelular.removeEventListener('change', aoMudarTamanho);
    consultaParado.removeEventListener('change', aoMudarTamanho);
    anterior?.removeEventListener('click', aoAnterior);
    proximaPauta?.removeEventListener('click', aoProxima);
    carrossel?.removeEventListener('scroll', aoRolarFaixa);
    carrossel?.removeEventListener('focusin', aoFocar);
    sonda.remove();
    delete raiz.dataset.cinema;
  };
}
