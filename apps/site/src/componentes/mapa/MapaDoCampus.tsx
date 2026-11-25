'use client';

import { rotuloDaCategoria } from '@lumens/contratos';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Pauta, StatusPauta } from '../../dados/tipos';
import {
  COMANDO_NOVA_PAUTA,
  comandoApoiar,
  comandoNovaPautaNoBloco,
  linkDoBot,
  nomeDoCanal,
} from '../../whatsapp';
import { formatarNumero } from '../BarraApoios';
import { aceitaApoio } from '../../dados/pautas-publicas';
import { STATUS } from '../StatusPill';
import {
  arrastar,
  ativas,
  blocoDoToque,
  clamp,
  enquadrarLocal,
  enquadrarLugares,
  interpolar,
  larguraDaPinca,
  LARGURA_DO_CELULAR,
  LARGURA_DO_PERTO,
  locaisDe,
  melhor,
  passoDoTeclado,
  porPredio,
  porPrioridade,
  prioDoLocal,
  quadroDaCamera,
  giroDoDesenho,
  girar,
  paraODesenho,
  suavizar,
  zoomNoPonto,
  type Camera,
} from './camera';
import { CAMINHOS, CONTORNO, PREDIOS } from './predios';
import { SLUG_DO_CAMPUS, type MarcadorDoBloco } from './urgencia';
import { RolagemArrastavel } from '../RolagemArrastavel';
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

const cor = (status: StatusPauta) => STATUS[status].ponto;
const plural = (n: number, um: string, varios: string) => `${String(n)} ${n === 1 ? um : varios}`;

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

/**
 * "Criar pauta neste bloco": abre o bot com `nova pauta <slug>`; a conversa já começa no bloco.
 * Pauta de todo o campus não tem bloco: o bot pergunta onde é.
 */
function CriarPauta({ bloco, slug }: { bloco: string; slug: string }) {
  const href = linkDoBot(
    slug === SLUG_DO_CAMPUS ? COMANDO_NOVA_PAUTA : comandoNovaPautaNoBloco(slug),
  );
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

/**
 * Mapa do campus em tela cheia (protótipo). Os blocos com pauta acendem na cor da que mais pede
 * atenção; os chips filtram por etapa; tocar num prédio aproxima o mapa e abre as pautas dele na
 * gaveta (celular) ou no painel da direita (computador). Arrastar move, a roda e a pinça aproximam;
 * as setas e +/− fazem o mesmo pelo teclado.
 */
/** Quanto o mapa gira por pixel arrastado com o mouse, e por toque nas teclas `,` e `.`. */
const RADIANOS_POR_PIXEL = 0.006;
const PASSO_DO_GIRO = Math.PI / 12;

/**
 * Quem pode apoiar e abrir pauta no bloco (SCRUM-399): a regra aparece antes de a pessoa tentar,
 * porque o apoio de quem é de outro curso é recusado.
 */
export function frasesDosCursos(cursos: readonly string[]): string {
  return cursos.length === 0
    ? 'Aberto a qualquer estudante verificado.'
    : `Apoia e abre pauta aqui quem é de: ${cursos.join(', ')}. Pautas de infraestrutura, segurança e acessibilidade são de todos.`;
}

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
  const porPredioId = useMemo(() => porPredio(locais), [locais]);
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
  const celular = () => window.innerWidth < LARGURA_DO_CELULAR;

  /** Põe a câmera no desenho: o `viewBox`, o raio dos pontos e o tamanho dos nomes. */
  const aplicar = useCallback(() => {
    const el = svg.current;
    if (!el) return;
    const { k, viewBox } = quadroDaCamera(cam.current, medida.current);
    el.setAttribute('viewBox', viewBox);
    el.querySelector('[data-mundo]')?.setAttribute('transform', giroDoDesenho(cam.current));
    palco.current?.classList.toggle(estilos.perto ?? '', cam.current.w < LARGURA_DO_PERTO);
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
      const y = Number(t.dataset.y) + 14 * k;
      t.setAttribute('y', String(y));
      // O nome não gira com o mapa: fica em pé, em torno do próprio ponto.
      const graus = (-(cam.current.giro ?? 0) * 180) / Math.PI;
      t.setAttribute(
        'transform',
        `rotate(${String(graus)} ${t.getAttribute('x') ?? '0'} ${String(y)})`,
      );
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
        // Sem animação, mas o mapa segue girado como estava.
        const giro = cam.current.giro;
        cam.current = giro === undefined ? para : { ...para, giro };
        aplicar();
        return;
      }
      const de = { ...cam.current };
      const t0 = performance.now();
      const passo = (t: number) => {
        const k = clamp((t - t0) / ms, 0, 1);
        cam.current = interpolar(de, para, suavizar(k));
        aplicar();
        if (k < 1) animacao.current = requestAnimationFrame(passo);
      };
      passo(t0);
    },
    [aplicar],
  );

  const enquadrarTudo = useCallback(() => {
    const { filtro: f, locais: ls } = vivo.current;
    const alvo = enquadrarLugares(ls, f, medida.current, celular(), cam.current.giro ?? 0);
    if (!alvo) return;
    setGaveta('');
    voar(alvo, 700);
  }, [voar]);

  const escolher = useCallback(
    (chave: string) => {
      const l = vivo.current.porChave.get(chave);
      if (!l) return;
      setSel(chave);
      setGaveta('meio');
      // Bloco sem prédio no desenho (todo o campus, bloco ainda sem prédio): só abre a gaveta.
      if (l.centro) {
        voar(
          enquadrarLocal(
            { ...l, centro: l.centro },
            medida.current,
            celular(),
            window.innerHeight,
            cam.current.giro ?? 0,
          ),
          800,
        );
      }
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
      cam.current = zoomNoPonto(cam.current, medida.current, f, px - r.left, py - r.top);
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
    // Mouse: o botão esquerdo gira o mapa; o direito, ou Shift + esquerdo, move. Toque: um dedo
    // move e dois dedos aproximam e giram.
    let modo: 'girar' | 'mover' = 'mover';
    let pinca: { d: number; w: number; ang: number; giro: number } | null = null;
    const dist = () => {
      const [a, b] = [...ponteiros.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1;
    };
    const angulo = () => {
      const [a, b] = [...ponteiros.values()];
      return a && b ? Math.atan2(b.y - a.y, b.x - a.x) : 0;
    };
    const baixou = (e: PointerEvent) => {
      cancelAnimationFrame(animacao.current);
      el.setPointerCapture(e.pointerId);
      ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      mexeu = 0;
      modo = e.pointerType === 'mouse' && e.button === 0 && !e.shiftKey ? 'girar' : 'mover';
      if (ponteiros.size === 2) {
        pinca = { d: dist(), w: cam.current.w, ang: angulo(), giro: cam.current.giro ?? 0 };
      }
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
        cam.current =
          modo === 'girar'
            ? girar(cam.current, dx * RADIANOS_POR_PIXEL)
            : arrastar(cam.current, medida.current, dx, dy);
        mexeu += Math.abs(dx) + Math.abs(dy);
        if (mexeu > 6) esconderDicaRef.current();
        aplicar();
      } else if (ponteiros.size === 2 && pinca) {
        mexeu = 99;
        esconderDicaRef.current();
        cam.current = {
          ...cam.current,
          w: larguraDaPinca(pinca.w, pinca.d, dist()),
          giro: pinca.giro + (angulo() - pinca.ang),
        };
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
      const k = passoDoTeclado(cam.current, medida.current);
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
        // As setas movem na tela: com o mapa girado, o deslocamento é levado para o desenho.
        const [mx, my] = paraODesenho(cam.current.giro ?? 0, m[0], m[1]);
        cam.current = { ...cam.current, cx: cam.current.cx + mx, cy: cam.current.cy + my };
        aplicar();
      } else if (e.key === ',' || e.key === '.') {
        cam.current = girar(cam.current, (e.key === ',' ? -1 : 1) * PASSO_DO_GIRO);
        aplicar();
      } else if (e.key === 'n' || e.key === 'N') {
        cam.current = { ...cam.current, giro: 0 };
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
  // Os outros blocos (sem pauta, ou sem pauta na etapa filtrada) continuam ao alcance do teclado
  // e do leitor de tela, e é por eles que se cria a primeira pauta de um bloco.
  const outros = locais.filter((l) => ativas(l, filtro).length === 0 && l.chave !== SLUG_DO_CAMPUS);

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
        aria-label="Mapa do campus. Setas movem, mais e menos aproximam, vírgula e ponto giram, N volta ao norte."
      >
        <svg ref={svg} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g data-mundo>
            <path d={CONTORNO} className={estilos.solo} />
            {CAMINHOS.map((d) => (
              <path key={d} d={d} className={estilos.via} />
            ))}
            {PREDIOS.map((p) => {
              const locs = porPredioId.get(p.id) ?? [];
              const ps = locs.flatMap((l) => ativas(l, filtro));
              const acesa = ps.length > 0;
              const topo = acesa ? melhor(ps) : undefined;
              const alvo = blocoDoToque(locs, filtro);
              return (
                <path
                  key={p.id}
                  d={p.d}
                  className={[
                    estilos.predio,
                    acesa ? estilos.aceso : '',
                    locs.some((l) => l.chave === selChave) ? estilos.escolhido : '',
                  ]
                    .join(' ')
                    .trim()}
                  data-k={alvo?.chave}
                  style={topo ? ({ '--c': cor(topo.status) } as CSSProperties) : undefined}
                />
              );
            })}
            {[...porPredioId.values()].map((locs) => {
              const [primeiro] = locs;
              if (!primeiro?.predio || !primeiro.base) return null;
              const acesa = locs.some((l) => ativas(l, filtro).length > 0);
              return (
                <text
                  key={`n${String(primeiro.predio.id)}`}
                  className={[estilos.rotulo, acesa ? estilos.rotuloAceso : ''].join(' ').trim()}
                  x={primeiro.base.x}
                  y={primeiro.base.y}
                  data-nome
                  data-y={primeiro.base.y}
                >
                  {primeiro.predio.sigla || primeiro.nome}
                </text>
              );
            })}
            {[...porPredioId.values()].map((locs) => {
              const centro = locs[0]?.centro;
              const topo = melhor(locs.flatMap((l) => ativas(l, filtro)));
              const alvo = blocoDoToque(locs, filtro);
              if (!centro || !topo || !alvo) return null;
              const estiloDaCor = { '--c': cor(topo.status) } as CSSProperties;
              return (
                <g key={`p${alvo.chave}`}>
                  <circle
                    cx={centro.x}
                    cy={centro.y}
                    className={estilos.onda}
                    style={estiloDaCor}
                    data-onda
                  />
                  <circle cx={centro.x} cy={centro.y} className={estilos.ponto} data-ponto />
                  <circle
                    cx={centro.x}
                    cy={centro.y}
                    className={estilos.toque}
                    data-toque
                    data-k={alvo.chave}
                  />
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className={estilos.topo}>
        <RolagemArrastavel className={estilos.chips} role="group" aria-label="Mostrar no mapa">
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
        </RolagemArrastavel>
        <p className={[estilos.dica, dica ? '' : estilos.dicaOculta].join(' ').trim()}>
          Arraste para girar; Shift ou botão direito move. Com dois dedos, aproxime e gire.
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
              <p className={estilos.sub} data-cursos-do-bloco>
                {frasesDosCursos(sel.cursos ?? [])}
              </p>
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
              {outros.length > 0 && (
                <details className={estilos.outros}>
                  <summary>
                    {filtro ? 'Blocos sem pauta nessa etapa' : 'Blocos sem pauta'} ({outros.length})
                  </summary>
                  {outros.map((l) => (
                    <button
                      key={l.chave}
                      type="button"
                      className={estilos.item}
                      style={{ '--c': '#74788c' } as CSSProperties}
                      onClick={() => {
                        escolher(l.chave);
                      }}
                    >
                      <i
                        className={[estilos.glifo, estilos.glifoVazado].join(' ')}
                        aria-hidden="true"
                      />
                      <strong>{l.nome}</strong>
                      <small>
                        {filtro ? 'Nenhuma pauta com essa etapa' : 'Nenhuma pauta ainda'}
                      </small>
                    </button>
                  ))}
                </details>
              )}
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
