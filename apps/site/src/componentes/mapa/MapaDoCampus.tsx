'use client';

import { rotuloDaCategoria } from '@lumens/contratos';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Pauta, StatusPauta } from '../../dados/tipos';
import { comandoApoiar, comandoNovaPautaNoBloco, linkDoBot, nomeDoCanal } from '../../whatsapp';
import { formatarNumero } from '../BarraApoios';
import { aceitaApoio } from '../../dados/pautas-publicas';
import { STATUS } from '../StatusPill';
import { CAMINHOS, CONTORNO, PREDIOS, type Predio } from './predios';
import type { MarcadorDoBloco } from './urgencia';
import estilos from './campus.module.css';

/** Ordem das etapas nos chips do mapa, como no protótipo. */
const ETAPAS: readonly StatusPauta[] = [
  'juntando_apoios',
  'meta_batida',
  'cobrando',
  'prometido',
  'entregue_em_parte',
  'conquistada',
  'descumprida',
];

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

/** O que a lista de blocos diz do status que manda na cor do bloco. */
const URG: Partial<Record<StatusPauta, string>> = {
  descumprida: 'Promessa descumprida',
  cobrando: 'Cobrando quem decide',
  prometido: 'Prometido',
  entregue_em_parte: 'Entregue em parte',
  meta_batida: 'Meta batida',
  juntando_apoios: 'Juntando apoios',
  conquistada: 'Só conquistas',
};

const prio = (p: Pauta) => PRIO[p.status] ?? 9;
const cor = (status: StatusPauta) => STATUS[status].ponto;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const plural = (n: number, um: string, varios: string) => `${String(n)} ${n === 1 ? um : varios}`;

/** Um lugar do mapa: um prédio e as pautas dos blocos que moram nele. */
interface Local {
  chave: string;
  predio: Predio;
  nome: string;
  slug: string;
  pautas: Pauta[];
  centro: { x: number; y: number; s: number };
  /** Onde o nome fica: o meio da borda de baixo do prédio. */
  base: { x: number; y: number };
}

function locaisDe(marcadores: readonly MarcadorDoBloco[]): Local[] {
  const porPredio = new Map<number, Local>();
  for (const m of marcadores) {
    if (m.predio === undefined) continue;
    const existente = porPredio.get(m.predio);
    if (existente) {
      existente.pautas.push(...m.pautas);
      continue;
    }
    const predio = PREDIOS.find((p) => p.id === m.predio);
    if (!predio) continue;
    const [x = 0, y = 0, w = 0, h = 0] = predio.caixa;
    porPredio.set(m.predio, {
      chave: m.slug,
      predio,
      nome: m.nome,
      slug: m.slug,
      pautas: [...m.pautas],
      centro: { x: x + w / 2, y: y + h / 2, s: Math.max(w, h) },
      base: { x: x + w / 2, y: y + h },
    });
  }
  return [...porPredio.values()];
}

const ativas = (l: Local, filtro: StatusPauta | null) =>
  l.pautas.filter((p) => !filtro || p.status === filtro);
const melhor = (ps: readonly Pauta[]) =>
  [...ps].sort((a, b) => prio(a) - prio(b) || b.apoios - a.apoios)[0];
const prioDoLocal = (l: Local, f: StatusPauta | null) => {
  const topo = melhor(ativas(l, f));
  return topo ? prio(topo) : 9;
};
const porPrioridade = (a: Pauta, b: Pauta) => prio(a) - prio(b) || b.apoios - a.apoios;

/** O botão "Apoiar pelo WhatsApp" da pauta na gaveta; sem bot configurado, não aparece. */
function Apoiar({ pauta }: { pauta: Pauta }) {
  const href = linkDoBot(comandoApoiar(pauta.slug));
  if (!href || !aceitaApoio(pauta.status)) return null;
  const texto = `Apoiar pelo ${nomeDoCanal()}`;
  return (
    <a
      href={href}
      className={estilos.apoiar}
      aria-label={`${texto}: ${pauta.titulo}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {texto}
    </a>
  );
}

/** "Criar pauta neste bloco": abre o bot com `nova pauta <slug>`; a conversa já começa no bloco. */
function CriarPauta({ bloco, slug }: { bloco: string; slug: string }) {
  const href = linkDoBot(comandoNovaPautaNoBloco(slug));
  if (!href) return null;
  return (
    <a
      href={href}
      className={estilos.apoiar}
      aria-label={`Criar pauta neste bloco: ${bloco}, pelo ${nomeDoCanal()}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      Criar pauta neste bloco
    </a>
  );
}

function Glifo({ status }: { status: StatusPauta }) {
  return (
    <i
      className={[estilos.glifo, status === 'descumprida' ? estilos.glifoVazado : '']
        .join(' ')
        .trim()}
      aria-hidden="true"
    />
  );
}

type Camera = { cx: number; cy: number; w: number };

/**
 * Mapa do campus em tela cheia (protótipo). Os blocos com pauta acendem na cor da que mais pede
 * atenção; os chips filtram por etapa; tocar num prédio aproxima o mapa e abre as pautas dele na
 * gaveta (celular) ou no painel da direita (computador). Arrastar move, a roda e a pinça aproximam;
 * as setas e +/− fazem o mesmo pelo teclado.
 */
export function MapaDoCampus({
  marcadores,
  blocoInicial,
}: {
  marcadores: MarcadorDoBloco[];
  /** Bloco que abre selecionado (`/mapa?bloco=slug`). */
  blocoInicial?: string | undefined;
}) {
  const locais = useMemo(() => locaisDe(marcadores), [marcadores]);
  const porChave = useMemo(() => new Map(locais.map((l) => [l.chave, l])), [locais]);
  const porPredioId = useMemo(() => new Map(locais.map((l) => [l.predio.id, l])), [locais]);
  const [filtro, setFiltro] = useState<StatusPauta | null>(null);
  const [selChave, setSel] = useState<string | null>(null);
  const [gaveta, setGaveta] = useState<'' | 'meio' | 'aberta'>('');
  const [dica, setDica] = useState(true);

  const raiz = useRef<HTMLDivElement>(null);
  const palco = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const cam = useRef<Camera>({ cx: 1060, cy: 790, w: 1400 });
  const medida = useRef({ vw: 1, vh: 1 });
  const animacao = useRef(0);
  const dicaOculta = useRef(false);
  const vivo = useRef({ filtro, locais, porChave });
  useEffect(() => {
    vivo.current = { filtro, locais, porChave };
  }, [filtro, locais, porChave]);

  const reduzido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const celular = () => window.innerWidth < 900;

  /** Põe a câmera no desenho: o `viewBox`, o raio dos pontos e o tamanho dos nomes. */
  const aplicar = useCallback(() => {
    const el = svg.current;
    if (!el) return;
    const { vw, vh } = medida.current;
    const { cx, cy, w } = cam.current;
    const k = w / vw;
    const h = vh * k;
    el.setAttribute(
      'viewBox',
      `${String(cx - w / 2)} ${String(cy - h / 2)} ${String(w)} ${String(h)}`,
    );
    palco.current?.classList.toggle(estilos.perto ?? '', w < 620);
    el.querySelectorAll('[data-ponto]').forEach((e) => {
      e.setAttribute('r', String(3.5 * k));
    });
    el.querySelectorAll('[data-onda]').forEach((e) => {
      e.setAttribute('r', String(11 * k));
    });
    el.querySelectorAll('[data-toque]').forEach((e) => {
      e.setAttribute('r', String(26 * k));
    });
    el.querySelectorAll<SVGTextElement>('[data-nome]').forEach((t) => {
      t.setAttribute('font-size', String(12 * k));
      t.setAttribute('stroke-width', String(3.2 * k));
      t.setAttribute('y', String(Number(t.dataset.y) + 14 * k));
    });
  }, []);

  const medir = useCallback(() => {
    medida.current = {
      vw: palco.current?.clientWidth || 1,
      vh: palco.current?.clientHeight || 1,
    };
  }, []);

  const voar = useCallback(
    (para: Camera, ms: number) => {
      cancelAnimationFrame(animacao.current);
      if (reduzido()) {
        cam.current = para;
        aplicar();
        return;
      }
      const de = { ...cam.current };
      const t0 = performance.now();
      const passo = (t: number) => {
        const k = clamp((t - t0) / ms, 0, 1);
        const e = 1 - Math.pow(1 - k, 3);
        cam.current = {
          cx: de.cx + (para.cx - de.cx) * e,
          cy: de.cy + (para.cy - de.cy) * e,
          w: de.w * Math.pow(para.w / de.w, e),
        };
        aplicar();
        if (k < 1) animacao.current = requestAnimationFrame(passo);
      };
      passo(t0);
    },
    [aplicar],
  );

  /** Quanto o centro da câmera desce para o ponto ficar na parte livre acima da gaveta (celular). */
  const deslocar = (w: number, gavetaPx: number) => {
    if (!celular()) return 0;
    const { vw, vh } = medida.current;
    const k = w / vw;
    const alvo = (74 + vh - gavetaPx) / 2;
    return (vh / 2 - alvo) * k;
  };

  const enquadrarTudo = useCallback(() => {
    const { filtro: f, locais: ls } = vivo.current;
    let alvo = ls.filter((l) => ativas(l, f).length > 0);
    if (alvo.length === 0) alvo = ls;
    if (alvo.length === 0) return;
    const xs = alvo.map((l) => l.centro.x);
    const ys = alvo.map((l) => l.centro.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const { vw, vh } = medida.current;
    const bw = Math.max(x1 - x0, 80);
    const bh = Math.max(y1 - y0, 80);
    const r = vh / vw;
    const util = celular() ? 0.58 : 0.8;
    const w = Math.max(bw * 1.5, (bh * 1.5) / (r * util));
    setGaveta('');
    voar({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 + deslocar(w, 188), w: clamp(w, 200, 2300) }, 700);
  }, [voar]);

  const escolher = useCallback(
    (chave: string) => {
      const l = vivo.current.porChave.get(chave);
      if (!l) return;
      setSel(chave);
      setGaveta('meio');
      const w = Math.max(230, l.centro.s * 4.2);
      voar(
        {
          cx: l.centro.x,
          cy: l.centro.y + deslocar(w, Math.min(0.46 * window.innerHeight, 400)),
          w,
        },
        800,
      );
    },
    [voar],
  );

  const soltar = useCallback(() => {
    setSel(null);
    setGaveta('');
  }, []);

  const acoes = useRef({ escolher, soltar, enquadrarTudo });
  useEffect(() => {
    acoes.current = { escolher, soltar, enquadrarTudo };
  }, [escolher, soltar, enquadrarTudo]);

  const esconderDica = () => {
    if (dicaOculta.current) return;
    dicaOculta.current = true;
    setDica(false);
  };
  const esconderDicaRef = useRef(esconderDica);
  useEffect(() => {
    esconderDicaRef.current = esconderDica;
  });

  const zoomEm = useCallback(
    (f: number, px: number, py: number) => {
      const el = palco.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const { vw } = medida.current;
      const c = cam.current;
      const k = c.w / vw;
      const mx = c.cx + (px - r.left - vw / 2) * k;
      const my = c.cy + (py - r.top - medida.current.vh / 2) * k;
      const nw = clamp(c.w * f, 140, 2300);
      const nk = nw / vw;
      cam.current = {
        cx: mx - (px - r.left - vw / 2) * nk,
        cy: my - (py - r.top - medida.current.vh / 2) * nk,
        w: nw,
      };
      aplicar();
    },
    [aplicar],
  );
  const zoomNoCentro = (f: number) => {
    const r = palco.current?.getBoundingClientRect();
    if (r) zoomEm(f, r.left + medida.current.vw / 2, r.top + medida.current.vh / 2);
  };

  // A câmera: arrastar (qualquer botão), pinça, roda e teclado. Tudo aqui é nativo porque a roda
  // precisa de `preventDefault` e o arraste de captura do ponteiro.
  useEffect(() => {
    const el = palco.current;
    if (!el) return;
    medir();
    aplicar();
    const ponteiros = new Map<number, { x: number; y: number }>();
    let mexeu = 0;
    let pinca: { d: number; w: number } | null = null;
    const dist = () => {
      const [a, b] = [...ponteiros.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1;
    };
    const baixou = (e: PointerEvent) => {
      cancelAnimationFrame(animacao.current);
      el.setPointerCapture(e.pointerId);
      ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      mexeu = 0;
      if (ponteiros.size === 2) pinca = { d: dist(), w: cam.current.w };
      el.classList.add(estilos.arrastando ?? '');
    };
    const moveu = (e: PointerEvent) => {
      const p = ponteiros.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (ponteiros.size === 1) {
        const k = cam.current.w / medida.current.vw;
        cam.current = { ...cam.current, cx: cam.current.cx - dx * k, cy: cam.current.cy - dy * k };
        mexeu += Math.abs(dx) + Math.abs(dy);
        if (mexeu > 6) esconderDicaRef.current();
        aplicar();
      } else if (ponteiros.size === 2 && pinca) {
        mexeu = 99;
        esconderDicaRef.current();
        cam.current = { ...cam.current, w: clamp((pinca.w * pinca.d) / dist(), 140, 2300) };
        aplicar();
      }
    };
    const terminou = (e: PointerEvent) => {
      if (!ponteiros.has(e.pointerId)) return;
      const toque = mexeu < 8 && ponteiros.size === 1 && e.type === 'pointerup';
      ponteiros.delete(e.pointerId);
      if (ponteiros.size < 2) pinca = null;
      if (ponteiros.size === 0) el.classList.remove(estilos.arrastando ?? '');
      if (toque && e.button === 0) {
        const alvo = document.elementFromPoint(e.clientX, e.clientY);
        const k = alvo?.closest('[data-k]')?.getAttribute('data-k');
        if (k) acoes.current.escolher(k);
        else acoes.current.soltar();
      }
    };
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      esconderDicaRef.current();
      zoomEm(Math.exp(e.deltaY * 0.0016), e.clientX, e.clientY);
    };
    const tecla = (e: KeyboardEvent) => {
      const k = (cam.current.w / medida.current.vw) * 60;
      const mover: Record<string, [number, number]> = {
        ArrowLeft: [-k, 0],
        ArrowRight: [k, 0],
        ArrowUp: [0, -k],
        ArrowDown: [0, k],
      };
      const m = mover[e.key];
      if (e.key === 'Escape') acoes.current.soltar();
      else if (m) {
        e.preventDefault();
        cam.current = { ...cam.current, cx: cam.current.cx + m[0], cy: cam.current.cy + m[1] };
        aplicar();
      } else if (e.key === '+' || e.key === '=') zoomNoCentro(0.8);
      else if (e.key === '-') zoomNoCentro(1.25);
    };
    const semMenu = (e: Event) => {
      e.preventDefault();
    };
    el.addEventListener('pointerdown', baixou);
    el.addEventListener('pointermove', moveu);
    el.addEventListener('pointerup', terminou);
    el.addEventListener('pointercancel', terminou);
    el.addEventListener('wheel', roda, { passive: false });
    el.addEventListener('keydown', tecla);
    el.addEventListener('contextmenu', semMenu);
    el.addEventListener('auxclick', semMenu);
    const observa = new ResizeObserver(() => {
      medir();
      aplicar();
      const cabecalho = document.querySelector('body > header');
      raiz.current?.style.setProperty(
        '--hdr',
        `${String(cabecalho?.getBoundingClientRect().height ?? 64)}px`,
      );
    });
    observa.observe(el);
    return () => {
      observa.disconnect();
      cancelAnimationFrame(animacao.current);
      el.removeEventListener('pointerdown', baixou);
      el.removeEventListener('pointermove', moveu);
      el.removeEventListener('pointerup', terminou);
      el.removeEventListener('pointercancel', terminou);
      el.removeEventListener('wheel', roda);
      el.removeEventListener('keydown', tecla);
      el.removeEventListener('contextmenu', semMenu);
      el.removeEventListener('auxclick', semMenu);
    };
  }, []);

  // Raios e nomes dos elementos que o React acaba de montar (filtros acendem e apagam pontos).
  useEffect(() => {
    aplicar();
  }, [aplicar, filtro, locais, selChave]);

  // Ao entrar: o bloco pedido pela URL ou todos os blocos com pauta.
  useEffect(() => {
    medir();
    if (blocoInicial && porChave.has(blocoInicial)) acoes.current.escolher(blocoInicial);
    else acoes.current.enquadrarTudo();
    // Só na entrada: os próximos movimentos são do usuário.
  }, []);

  const contagem = useMemo(() => {
    const c = new Map<StatusPauta, number>();
    for (const l of locais) for (const p of l.pautas) c.set(p.status, (c.get(p.status) ?? 0) + 1);
    return c;
  }, [locais]);

  const sel = selChave ? porChave.get(selChave) : undefined;
  const lista = locais
    .filter((l) => ativas(l, filtro).length > 0)
    .sort((a, b) => prioDoLocal(a, filtro) - prioDoLocal(b, filtro));
  const totalDePautas = lista.reduce((n, l) => n + ativas(l, filtro).length, 0);

  const alternarGaveta = () => {
    if (gaveta === 'aberta') setGaveta(sel ? 'meio' : '');
    else setGaveta('aberta');
  };

  const classeDaRaiz = [
    estilos.mapa,
    gaveta === 'meio' ? estilos.meio : '',
    gaveta === 'aberta' ? estilos.aberta : '',
  ]
    .join(' ')
    .trim();

  return (
    <div ref={raiz} className={classeDaRaiz}>
      <div
        ref={palco}
        className={estilos.palco}
        tabIndex={0}
        role="application"
        aria-label="Mapa do campus. Setas movem, mais e menos aproximam."
      >
        <svg ref={svg} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d={CONTORNO} className={estilos.solo} />
          {CAMINHOS.map((d) => (
            <path key={d} d={d} className={estilos.via} />
          ))}
          {PREDIOS.map((p) => {
            const l = porPredioId.get(p.id);
            const ps = l ? ativas(l, filtro) : [];
            const acesa = ps.length > 0;
            const topo = acesa ? melhor(ps) : undefined;
            return (
              <path
                key={p.id}
                d={p.d}
                className={[
                  estilos.predio,
                  acesa ? estilos.aceso : '',
                  l && l.chave === selChave ? estilos.escolhido : '',
                ]
                  .join(' ')
                  .trim()}
                data-k={l?.chave}
                style={topo ? ({ '--c': cor(topo.status) } as CSSProperties) : undefined}
              />
            );
          })}
          {locais.map((l) => {
            const acesa = ativas(l, filtro).length > 0;
            return (
              <text
                key={`n${l.chave}`}
                className={[estilos.rotulo, acesa ? estilos.rotuloAceso : ''].join(' ').trim()}
                x={l.base.x}
                y={l.base.y}
                data-nome
                data-y={l.base.y}
              >
                {l.predio.sigla || l.nome}
              </text>
            );
          })}
          {locais.map((l) => {
            const ps = ativas(l, filtro);
            if (ps.length === 0) return null;
            const topo = melhor(ps);
            if (!topo) return null;
            const estiloDaCor = { '--c': cor(topo.status) } as CSSProperties;
            return (
              <g key={`p${l.chave}`}>
                <circle
                  cx={l.centro.x}
                  cy={l.centro.y}
                  className={estilos.onda}
                  style={estiloDaCor}
                  data-onda
                />
                <circle cx={l.centro.x} cy={l.centro.y} className={estilos.ponto} data-ponto />
                <circle
                  cx={l.centro.x}
                  cy={l.centro.y}
                  className={estilos.toque}
                  data-toque
                  data-k={l.chave}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className={estilos.topo}>
        <div className={estilos.chips} role="group" aria-label="Mostrar no mapa">
          <button
            type="button"
            className={estilos.chip}
            aria-pressed={filtro === null}
            onClick={() => {
              setFiltro(null);
            }}
          >
            Tudo aceso
          </button>
          {ETAPAS.filter((e) => (contagem.get(e) ?? 0) > 0).map((e) => (
            <button
              key={e}
              type="button"
              className={estilos.chip}
              aria-pressed={filtro === e}
              style={{ '--c': cor(e) } as CSSProperties}
              onClick={() => {
                setFiltro(e);
                if (sel && !ativas(sel, e).length) soltar();
              }}
            >
              <i />
              {STATUS[e].rotulo} <b>{contagem.get(e)}</b>
            </button>
          ))}
        </div>
        <p className={[estilos.dica, dica ? '' : estilos.dicaOculta].join(' ').trim()}>
          Arraste para mover. Com dois dedos, aproxime.
        </p>
      </div>

      <div className={estilos.zoom} role="group" aria-label="Zoom">
        <button
          type="button"
          aria-label="Aproximar"
          onClick={() => {
            zoomNoCentro(0.7);
          }}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Afastar"
          onClick={() => {
            zoomNoCentro(1.4);
          }}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Ver todos os blocos com pautas"
          onClick={() => {
            setSel(null);
            enquadrarTudo();
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
      </div>

      <aside className={estilos.gaveta} aria-live="polite">
        <button
          type="button"
          className={estilos.alca}
          aria-expanded={gaveta === 'aberta'}
          aria-label={gaveta === 'aberta' ? 'Recolher lista' : 'Expandir lista'}
          onClick={alternarGaveta}
        >
          <i />
        </button>
        <div className={estilos.corpo}>
          {sel ? (
            <>
              <button
                type="button"
                className={estilos.voltar}
                onClick={() => {
                  setSel(null);
                  enquadrarTudo();
                }}
              >
                ← Todos os blocos
              </button>
              <h1 className={estilos.somenteLeitor}>Mapa do campus</h1>
              <h2>{sel.nome}</h2>
              {ativas(sel, filtro).length > 0 ? (
                <p className={estilos.sub}>
                  {plural(ativas(sel, filtro).length, 'pauta neste bloco.', 'pautas neste bloco.')}
                </p>
              ) : (
                <p className={estilos.sub}>
                  {filtro && sel.pautas.length > 0
                    ? 'Nenhuma pauta com essa etapa aqui.'
                    : 'Nenhuma pauta neste bloco ainda.'}
                </p>
              )}
              {[...ativas(sel, filtro)].sort(porPrioridade).map((p) => (
                <div
                  key={p.slug}
                  className={estilos.pa}
                  style={{ '--c': cor(p.status) } as CSSProperties}
                >
                  <Glifo status={p.status} />
                  <strong>
                    <Link href={`/p/${p.slug}`}>{p.titulo}</Link>
                  </strong>
                  <span className={estilos.n}>{formatarNumero(p.apoios)}</span>
                  <small>
                    <b>{STATUS[p.status].rotulo}</b>
                    {p.urgente ? ' · Urgente' : ''}
                    {rotuloDaCategoria(p.categoria)
                      ? ` · ${rotuloDaCategoria(p.categoria) ?? ''}`
                      : ''}
                  </small>
                  <span
                    className={estilos.fio}
                    style={
                      {
                        '--p': `${String(clamp((p.apoios / Math.max(p.meta, 1)) * 100, 0, 100))}%`,
                      } as CSSProperties
                    }
                  >
                    <i />
                  </span>
                  <Apoiar pauta={p} />
                </div>
              ))}
              <div className={estilos.novo}>
                <p>
                  {ativas(sel, filtro).length > 0
                    ? 'Viu outro problema aqui?'
                    : 'Viu algum problema neste prédio? Ele pode virar uma pauta.'}
                </p>
                <CriarPauta bloco={sel.nome} slug={sel.slug} />
              </div>
            </>
          ) : (
            <>
              <h1>Onde há pautas</h1>
              <p className={estilos.sub}>
                {plural(lista.length, 'bloco aceso', 'blocos acesos')} ·{' '}
                {plural(totalDePautas, 'pauta', 'pautas')}. Toque num bloco no mapa ou aqui.
              </p>
              {lista.map((l) => {
                const ps = ativas(l, filtro);
                const topo = melhor(ps);
                if (!topo) return null;
                const apoios = ps.reduce((n, p) => n + p.apoios, 0);
                return (
                  <button
                    key={l.chave}
                    type="button"
                    className={estilos.item}
                    style={{ '--c': cor(topo.status) } as CSSProperties}
                    onClick={() => {
                      escolher(l.chave);
                    }}
                  >
                    <Glifo status={topo.status} />
                    <strong>{l.nome}</strong>
                    <em>{formatarNumero(apoios)}</em>
                    <small>
                      <b>{URG[topo.status]}</b> · {plural(ps.length, 'pauta', 'pautas')}
                    </small>
                  </button>
                );
              })}
              {lista.length === 0 && <p className={estilos.sub}>Nenhum bloco com essa etapa.</p>}
              <p className={estilos.dicaDoPainel}>
                Toque num prédio apagado para relatar um problema nele.
              </p>
            </>
          )}
        </div>
      </aside>

      <p className={estilos.credito}>
        ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          colaboradores do OpenStreetMap
        </a>
      </p>
    </div>
  );
}
