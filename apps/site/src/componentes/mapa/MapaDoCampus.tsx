'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { formatarNumero } from '../BarraApoios';
import { BotaoRelatar } from '../BotaoWhatsApp';
import { StatusPill } from '../StatusPill';
import {
  ALTURA_DO_CAMPUS,
  CAMINHOS,
  CONTORNO,
  LARGURA_DO_CAMPUS,
  PREDIOS,
  type Predio,
} from './predios';
import { enquadrar } from './MapaResumo';
import { LEGENDA, type MarcadorDoBloco } from './urgencia';
import estilos from './mapa.module.css';

type Visao = { x: number; y: number; w: number; h: number };

const DURACAO_MS = 550;

/** Enquadra o prédio com folga, mantendo a proporção do desenho. */
function visaoDoPredio(predio: Predio): Visao {
  const [x = 0, y = 0, largura = 0, altura = 0] = predio.caixa;
  const cx = x + largura / 2;
  const cy = y + altura / 2;
  const w = Math.min(LARGURA_DO_CAMPUS, Math.max(420, Math.max(largura, altura) * 5));
  const h = (w * ALTURA_DO_CAMPUS) / LARGURA_DO_CAMPUS;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Sigla do prédio logo abaixo dele, num tamanho que acompanha o zoom. */
function Sigla({ predio, tamanho }: { predio: Predio; tamanho: number }) {
  const [x = 0, y = 0, largura = 0, altura = 0] = predio.caixa;
  return (
    <text
      x={x + largura / 2}
      y={y + altura + tamanho * 1.1}
      fontSize={tamanho}
      className={estilos.sigla}
      aria-hidden="true"
    >
      {predio.sigla}
    </text>
  );
}

/**
 * Retângulo invisível em volta do prédio: no celular um prédio tem poucos pixels, e o vão entre
 * duas alas (o Bloco 18 tem duas) contaria como chão.
 */
function AreaDeToque({ caixa, folga }: { caixa: readonly number[]; folga: number }) {
  const [x = 0, y = 0, w = 0, h = 0] = caixa;
  return (
    <rect
      x={x - folga}
      y={y - folga}
      width={w + 2 * folga}
      height={h + 2 * folga}
      className={estilos.alvo}
    />
  );
}

/** Anima o `viewBox` até `alvo`; sem animação para quem pediu menos movimento. */
function useVisaoAnimada(alvo: Visao) {
  const [visao, setVisao] = useState(alvo);
  const atual = useRef(alvo);
  const quadroRef = useRef(0);
  useEffect(() => {
    const de = atual.current;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      atual.current = alvo;
      setVisao(alvo);
      return;
    }
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / DURACAO_MS);
      const e = 1 - (1 - t) ** 3;
      const v = {
        x: de.x + (alvo.x - de.x) * e,
        y: de.y + (alvo.y - de.y) * e,
        w: de.w + (alvo.w - de.w) * e,
        h: de.h + (alvo.h - de.h) * e,
      };
      atual.current = v;
      setVisao(v);
      if (t < 1) quadroRef.current = requestAnimationFrame(passo);
    };
    quadroRef.current = requestAnimationFrame(passo);
    return () => {
      cancelAnimationFrame(quadroRef.current);
    };
  }, [alvo]);
  /** Muda a visão na hora, sem animar: arrastar e pinçar seguem o dedo. */
  const pular = (v: Visao) => {
    cancelAnimationFrame(quadroRef.current);
    atual.current = v;
    setVisao(v);
  };
  return { visao, atual, pular };
}

const ZOOM_MINIMO = 150;
const ZOOM_MAXIMO = LARGURA_DO_CAMPUS * 1.3;

/** A visão depois de aproximar (`fator` < 1) ou afastar em torno de um ponto da tela. */
function aproximar(v: Visao, fator: number, px: number, py: number): Visao {
  const w = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, v.w * fator));
  const h = (w * v.h) / v.w;
  return { x: v.x + px * (v.w - w), y: v.y + py * (v.h - h), w, h };
}

/**
 * Arrastar com o mouse ou um dedo, pinçar com dois, e Ctrl + roda (ou a pinça do trackpad) para o
 * zoom. A roda sozinha continua rolando a página. Um arraste não conta como clique no prédio.
 */
function useArrastar(
  svg: React.RefObject<SVGSVGElement | null>,
  visivel: () => Visao,
  pular: (v: Visao) => void,
) {
  const dedos = useRef(new Map<number, { x: number; y: number }>());
  const arrastou = useRef(false);
  const inicio = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const roda = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      pular(
        aproximar(
          visivel(),
          Math.exp(e.deltaY * 0.01),
          (e.clientX - r.left) / r.width,
          (e.clientY - r.top) / r.height,
        ),
      );
    };
    el.addEventListener('wheel', roda, { passive: false });
    return () => {
      el.removeEventListener('wheel', roda);
    };
  }, [svg, visivel, pular]);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dedos.current.size === 1) {
      arrastou.current = false;
      inicio.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const antes = dedos.current.get(e.pointerId);
    const el = svg.current;
    if (!antes || !el) return;
    const r = el.getBoundingClientRect();
    const v = visivel();
    if (!arrastou.current && inicio.current) {
      const andou = Math.hypot(e.clientX - inicio.current.x, e.clientY - inicio.current.y);
      if (andou < 4) return;
      // Só agora o ponteiro é capturado: antes disso, o clique continua chegando ao prédio.
      arrastou.current = true;
      el.setPointerCapture(e.pointerId);
    }
    if (dedos.current.size >= 2) {
      const [a, b] = [...dedos.current.entries()];
      if (!a || !b) return;
      const outro = a[0] === e.pointerId ? b[1] : a[1];
      const distAntes = Math.hypot(antes.x - outro.x, antes.y - outro.y);
      const distAgora = Math.hypot(e.clientX - outro.x, e.clientY - outro.y);
      if (distAntes > 0 && distAgora > 0) {
        const meioX = ((e.clientX + outro.x) / 2 - r.left) / r.width;
        const meioY = ((e.clientY + outro.y) / 2 - r.top) / r.height;
        pular(aproximar(v, distAntes / distAgora, meioX, meioY));
      }
    } else {
      pular({
        ...v,
        x: v.x - ((e.clientX - antes.x) / r.width) * v.w,
        y: v.y - ((e.clientY - antes.y) / r.height) * v.h,
      });
    }
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const soltar = (e: React.PointerEvent<SVGSVGElement>) => {
    dedos.current.delete(e.pointerId);
    if (dedos.current.size === 0) inicio.current = null;
  };

  return {
    arrastou,
    eventos: { onPointerDown, onPointerMove, onPointerUp: soltar, onPointerCancel: soltar },
  };
}

/** Prédio aberto no painel: o do OpenStreetMap, o bloco do Lumens ligado a ele, ou os dois. */
type Selecao = { predio: Predio | undefined; bloco: MarcadorDoBloco | undefined };

/**
 * Mapa do campus (RF-S10) em tela cheia. Os prédios com bloco acendem na cor da pauta mais urgente;
 * tocar num prédio aproxima o mapa e abre o painel com as pautas de lá. Tocar no mapa vazio fecha.
 * A lista embaixo tem a mesma informação e também escolhe o bloco.
 */
export function MapaDoCampus({ marcadores }: { marcadores: MarcadorDoBloco[] }) {
  const porPredio = new Map(marcadores.flatMap((m) => (m.predio ? [[m.predio, m] as const] : [])));
  const [sel, setSel] = useState<Selecao | null>(null);
  // Abre enquadrado nos prédios com bloco: o campus inteiro tem 2 km e eles sumiriam.
  const geral = enquadrar([...porPredio.keys()]);
  const [alvo, setAlvo] = useState<Visao>(geral);
  const { visao, atual, pular } = useVisaoAnimada(alvo);
  const svg = useRef<SVGSVGElement>(null);

  // A tela não tem a proporção do campus: a visão cresce para cobrir a tela sem cortar o alvo.
  const [aspecto, setAspecto] = useState(LARGURA_DO_CAMPUS / ALTURA_DO_CAMPUS);
  const [larguraPx, setLarguraPx] = useState(1000);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const observador = new ResizeObserver(([e]) => {
      if (e && e.contentRect.width > 0 && e.contentRect.height > 0) {
        setAspecto(e.contentRect.width / e.contentRect.height);
        setLarguraPx(e.contentRect.width);
      }
    });
    observador.observe(el);
    return () => {
      observador.disconnect();
    };
  }, []);
  const cobrir = (v: Visao): Visao => {
    const h = v.w / aspecto;
    if (h >= v.h) return { ...v, y: v.y - (h - v.h) / 2, h };
    const w = v.h * aspecto;
    return { x: v.x - (w - v.w) / 2, y: v.y, w, h: v.h };
  };
  const tela = cobrir(visao);
  const { arrastou, eventos } = useArrastar(svg, () => cobrir(atual.current), pular);

  // Com o campus inteiro na tela, os nomes se amontoam; aparecem quando o mapa aproxima.
  const comNomes = tela.w < LARGURA_DO_CAMPUS * 0.3;
  // Folga de toque em volta de cada prédio: 8 px na tela, em metros do desenho.
  const folga = (8 * tela.w) / larguraPx;

  // No computador o painel ocupa a direita: o prédio aberto fica um pouco à esquerda do centro.
  const focar = (p: Predio): Visao => {
    const v = visaoDoPredio(p);
    return matchMedia('(min-width: 721px)').matches ? { ...v, x: v.x + v.w * 0.18 } : v;
  };

  // O teclado chama direto; o clique passa por `clicarPredio`, que ignora o clique do fim do arraste.
  const abrirPredio = (p: Predio) => {
    if (sel?.predio?.id === p.id) {
      setSel(null);
      return;
    }
    setSel({ predio: p, bloco: porPredio.get(p.id) });
    setAlvo(focar(p));
  };
  const clicarPredio = (p: Predio) => {
    if (!arrastou.current) abrirPredio(p);
  };
  const abrirBloco = (m: MarcadorDoBloco) => {
    const p = m.predio ? PREDIOS.find((x) => x.id === m.predio) : undefined;
    setSel({ predio: p, bloco: m });
    if (p) setAlvo(focar(p));
    svg.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };
  const fechar = () => {
    if (!arrastou.current) setSel(null);
  };
  const zoom = (fator: number) => {
    setAlvo(aproximar(cobrir(atual.current), fator, 0.5, 0.5));
  };

  const bloco = sel?.bloco;
  return (
    <>
      <div className={[estilos.tela, 'noite'].join(' ')}>
        <svg
          ref={svg}
          {...eventos}
          className={estilos.desenho}
          viewBox={`${String(tela.x)} ${String(tela.y)} ${String(tela.w)} ${String(tela.h)}`}
          role="group"
          aria-label="Mapa do campus. A lista abaixo do mapa tem a mesma informação."
        >
          <g onClick={fechar}>
            <rect
              x={-LARGURA_DO_CAMPUS}
              y={-ALTURA_DO_CAMPUS}
              width={LARGURA_DO_CAMPUS * 3}
              height={ALTURA_DO_CAMPUS * 3}
              className={estilos.chao}
            />
            <path d={CONTORNO} className={estilos.terreno} />
            {CAMINHOS.map((d) => (
              <path key={d} d={d} className={estilos.via} />
            ))}
          </g>
          {/* Os prédios com bloco vêm por último: ficam por cima e ganham o toque na disputa. */}
          {[...PREDIOS]
            .sort((a, b) => Number(porPredio.has(a.id)) - Number(porPredio.has(b.id)))
            .map((p) => {
              const m = porPredio.get(p.id);
              const aberto = sel?.predio?.id === p.id;
              const rotulo = m ? `${m.nome}: ${m.linha}` : p.nome;
              // Prédio com bloco é botão de verdade (teclado e leitor de tela). Os outros com nome
              // também abrem o painel ao toque; quem usa teclado tem a lista com os blocos.
              const acessivel = m
                ? {
                    role: 'button' as const,
                    tabIndex: 0,
                    'aria-pressed': aberto,
                    'aria-label': rotulo,
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        abrirPredio(p);
                      }
                    },
                  }
                : {};
              return (
                <g
                  key={p.id}
                  className={[
                    aberto ? estilos.escolhido : estilos.predio,
                    p.sigla ? estilos.tocavel : '',
                  ].join(' ')}
                  style={m ? { fill: m.cor, color: m.cor } : undefined}
                  onClick={
                    p.sigla
                      ? () => {
                          clicarPredio(p);
                        }
                      : fechar
                  }
                  {...acessivel}
                >
                  <title>{rotulo}</title>
                  {p.sigla && <AreaDeToque caixa={p.caixa} folga={folga} />}
                  <path d={p.d} />
                </g>
              );
            })}
          {/* Os nomes ficam numa camada por cima de todos os prédios, para nenhum cobrir o outro. */}
          <g aria-hidden="true">
            {PREDIOS.filter(
              (p) => p.sigla && (porPredio.has(p.id) || comNomes || sel?.predio?.id === p.id),
            ).map((p) => (
              <Sigla key={p.id} predio={p} tamanho={tela.w / 64} />
            ))}
          </g>
        </svg>

        <div className={estilos.hudTitulo}>
          <h1 className={estilos.hudNome}>Mapa do campus</h1>
          <p className={estilos.hudDica}>
            Toque num prédio. Arraste para mover e use a pinça ou Ctrl + roda para o zoom.
          </p>
        </div>

        <ul className={estilos.legenda} aria-label="Legenda das cores">
          {LEGENDA.map((l) => (
            <li key={l.rotulo}>
              <i className={estilos.ponto} style={{ background: l.cor }} />
              {l.rotulo}
            </li>
          ))}
        </ul>

        <div className={estilos.controles}>
          <button
            type="button"
            className={estilos.verCampus}
            onClick={() => {
              setSel(null);
              setAlvo(geral);
            }}
          >
            Ver todos os blocos
          </button>
          <div className={estilos.zoom}>
            <button
              type="button"
              aria-label="Aproximar o mapa"
              onClick={() => {
                zoom(1 / 1.6);
              }}
            >
              +
            </button>
            <button
              type="button"
              aria-label="Afastar o mapa"
              onClick={() => {
                zoom(1.6);
              }}
            >
              −
            </button>
          </div>
        </div>

        <p className={estilos.credito}>
          ©{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            colaboradores do OpenStreetMap
          </a>
        </p>

        <aside className={estilos.painel} data-aberto={sel !== null} aria-live="polite">
          {sel ? (
            <>
              <button
                type="button"
                className={estilos.fechar}
                aria-label="Fechar o painel"
                onClick={() => {
                  setSel(null);
                }}
              >
                ×
              </button>
              <p className={estilos.eyebrow}>{sel.predio?.nome ?? 'Bloco'}</p>
              <h2 className={estilos.tituloPainel}>{bloco?.nome ?? sel.predio?.sigla}</h2>
              {bloco ? (
                <>
                  <p className={estilos.detalhe}>{bloco.linha}</p>
                  {bloco.pautas.length === 0 ? (
                    <p className={estilos.vazio}>Nenhuma pauta aqui ainda.</p>
                  ) : (
                    <ul className={estilos.pautas}>
                      {bloco.pautas.map((pauta) => (
                        <li key={pauta.slug} className={estilos.pauta}>
                          <StatusPill status={pauta.status} />
                          <Link href={`/p/${pauta.slug}`}>{pauta.titulo}</Link>
                          <span className={estilos.detalhe}>
                            {formatarNumero(pauta.apoios)} de {formatarNumero(pauta.meta)} apoios
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  <p className={estilos.vazio}>
                    Nenhuma pauta neste prédio ainda. Viu algo que precisa mudar aqui?
                  </p>
                  <BotaoRelatar />
                </>
              )}
            </>
          ) : (
            <>
              <h2 className={estilos.tituloPainel}>Escolha um bloco</h2>
              <p className={estilos.detalhe}>Toque num prédio para ver as pautas de lá.</p>
            </>
          )}
        </aside>
      </div>

      <section className={estilos.abaixo}>
        <h2 className={estilos.tituloLista}>A mesma informação, em lista</h2>
        <ul className={estilos.lista}>
          {marcadores.map((m) => (
            <li key={m.slug}>
              <button
                type="button"
                className={estilos.linha}
                aria-pressed={sel?.bloco?.slug === m.slug}
                onClick={() => {
                  abrirBloco(m);
                }}
              >
                <i className={estilos.ponto} style={{ background: m.cor }} />
                <span>
                  <b>{m.nome}</b>
                  <span>{m.linha}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
