'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatarNumero } from '../BarraApoios';
import { BotaoRelatar } from '../BotaoWhatsApp';
import { StatusPill } from '../StatusPill';
import { criarCamera, type Visao } from './camera';
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

/** Enquadra o prédio com folga, mantendo a proporção do desenho. */
function visaoDoPredio(predio: Predio): Visao {
  const [x = 0, y = 0, largura = 0, altura = 0] = predio.caixa;
  const cx = x + largura / 2;
  const cy = y + altura / 2;
  const w = Math.min(LARGURA_DO_CAMPUS, Math.max(420, Math.max(largura, altura) * 5));
  const h = (w * ALTURA_DO_CAMPUS) / LARGURA_DO_CAMPUS;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * Sigla do prédio logo abaixo dele. O tamanho e o giro vêm do CSS: o nome não muda com o zoom e
 * fica em pé quando o mapa gira. O grupo põe a origem no pé do prédio, e é em torno dela que o
 * nome gira.
 */
function Sigla({ predio }: { predio: Predio }) {
  const [x = 0, y = 0, largura = 0, altura = 0] = predio.caixa;
  return (
    <g transform={`translate(${String(x + largura / 2)} ${String(y + altura)})`} aria-hidden="true">
      <text dy="1.15em" className={estilos.sigla}>
        {predio.sigla}
      </text>
    </g>
  );
}

/**
 * Retângulo invisível em volta do prédio: no celular um prédio tem poucos pixels, e o vão entre
 * duas alas (o Bloco 18 tem duas) contaria como chão. A folga de toque é o contorno, no CSS.
 */
function AreaDeToque({ caixa }: { caixa: readonly number[] }) {
  const [x = 0, y = 0, w = 0, h = 0] = caixa;
  return <rect x={x} y={y} width={w} height={h} className={estilos.alvo} />;
}

/** Prédio aberto no painel: o do OpenStreetMap, o bloco do Lumens ligado a ele, ou os dois. */
type Selecao = { predio: Predio | undefined; bloco: MarcadorDoBloco | undefined };

/**
 * Mapa do campus (RF-S10) em tela cheia. Os prédios com bloco acendem na cor da pauta mais urgente;
 * tocar num prédio aproxima o mapa e abre o painel com as pautas de lá. Tocar no mapa vazio fecha.
 * A lista embaixo tem a mesma informação e também escolhe o bloco.
 */
export function MapaDoCampus({ marcadores }: { marcadores: MarcadorDoBloco[] }) {
  const porPredio = useMemo(
    () => new Map(marcadores.flatMap((m) => (m.predio ? [[m.predio, m] as const] : []))),
    [marcadores],
  );
  const [sel, setSel] = useState<Selecao | null>(null);
  // Abre enquadrado nos prédios com bloco: o campus inteiro tem 2 km e eles sumiriam.
  const geral = useMemo(() => enquadrar([...porPredio.keys()]), [porPredio]);
  // Com o campus inteiro na tela, os nomes se amontoam; aparecem quando o mapa aproxima.
  const [comNomes, setComNomes] = useState(false);
  // O `viewBox` fica parado na visão de abertura; a câmera move a camada dentro dele.
  const [base] = useState(geral);
  const [camera] = useState(() =>
    criarCamera(base, (v) => {
      setComNomes(v.w < LARGURA_DO_CAMPUS * 0.3);
    }),
  );
  const svg = useRef<SVGSVGElement>(null);
  const camada = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!svg.current || !camada.current) return;
    return camera.ligar(svg.current, camada.current);
  }, [camera]);

  // Os prédios com bloco vêm por último: ficam por cima e ganham o toque na disputa.
  const predios = useMemo(
    () => [...PREDIOS].sort((a, b) => Number(porPredio.has(a.id)) - Number(porPredio.has(b.id))),
    [porPredio],
  );

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
    camera.irPara(focar(p));
  };
  const clicarPredio = (p: Predio) => {
    if (!camera.arrastou()) abrirPredio(p);
  };
  const abrirBloco = (m: MarcadorDoBloco) => {
    const p = m.predio ? PREDIOS.find((x) => x.id === m.predio) : undefined;
    setSel({ predio: p, bloco: m });
    if (p) camera.irPara(focar(p));
    svg.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };
  const fechar = () => {
    if (!camera.arrastou()) setSel(null);
  };

  const bloco = sel?.bloco;
  return (
    <>
      <div className={[estilos.tela, 'noite'].join(' ')}>
        <svg
          ref={svg}
          {...camera.eventos}
          className={estilos.desenho}
          viewBox={`${String(base.x)} ${String(base.y)} ${String(base.w)} ${String(base.h)}`}
          role="group"
          aria-label="Mapa do campus. A lista abaixo do mapa tem a mesma informação."
        >
          <g ref={camada}>
            {/* Dois toques (ou dois cliques) no chão aproximam o mapa naquele ponto. */}
            <g
              onClick={fechar}
              onDoubleClick={(e) => {
                camera.zoomNoPonteiro(0.5, e.clientX, e.clientY);
              }}
            >
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
            {predios.map((p) => {
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
                  {p.sigla && <AreaDeToque caixa={p.caixa} />}
                  {/* O halo é só um contorno largo: fica aceso mesmo com o mapa em movimento. */}
                  {m && <path d={p.d} className={estilos.halo} />}
                  <path d={p.d} />
                </g>
              );
            })}
            {/* Os nomes ficam numa camada por cima de todos os prédios, para nenhum cobrir o outro. */}
            <g aria-hidden="true">
              {PREDIOS.filter(
                (p) => p.sigla && (porPredio.has(p.id) || comNomes || sel?.predio?.id === p.id),
              ).map((p) => (
                <Sigla key={p.id} predio={p} />
              ))}
            </g>
          </g>
        </svg>

        <div className={estilos.hudTitulo}>
          <h1 className={estilos.hudNome}>Mapa do campus</h1>
          <p className={estilos.hudDica}>
            Toque num prédio. Arraste para mover; a roda, a pinça ou dois toques aproximam; dois
            dedos giram.
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
              camera.irPara(geral, 0);
            }}
          >
            Ver todos os blocos
          </button>
          {/* No celular o mapa toma a tela e o dedo move o mapa: este atalho leva à lista. */}
          <a href="#lista-do-mapa" className={estilos.verCampus}>
            Ver em lista
          </a>
          <div className={estilos.zoom}>
            {/* A seta aponta o norte: gira junto com o mapa, e o botão o endireita. */}
            <button
              type="button"
              aria-label="Voltar o norte para cima"
              onClick={() => {
                camera.norte();
              }}
            >
              <svg className={estilos.bussola} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3l4 9H8z" className={estilos.agulhaNorte} />
                <path d="M12 21l-4-9h8z" className={estilos.agulhaSul} />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Girar o mapa para a esquerda"
              onClick={() => {
                camera.girar(-Math.PI / 6);
              }}
            >
              ↺
            </button>
            <button
              type="button"
              aria-label="Girar o mapa para a direita"
              onClick={() => {
                camera.girar(Math.PI / 6);
              }}
            >
              ↻
            </button>
            <button
              type="button"
              aria-label="Aproximar o mapa"
              onClick={() => {
                camera.zoom(1 / 1.6);
              }}
            >
              +
            </button>
            <button
              type="button"
              aria-label="Afastar o mapa"
              onClick={() => {
                camera.zoom(1.6);
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

      <section id="lista-do-mapa" className={estilos.abaixo}>
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
