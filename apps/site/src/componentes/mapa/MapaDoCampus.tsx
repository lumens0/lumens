'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { formatarNumero } from '../BarraApoios';
import { BotaoRelatar } from '../BotaoWhatsApp';
import { Icone } from '../Icone';
import { STATUS, StatusPill } from '../StatusPill';
import { criarCamera, type Visao } from './camera';
import { enquadrar } from './MapaResumo';
import { nomesQueCabem, type Nome } from './nomes';
import {
  ALTURA_DO_CAMPUS,
  AREAS,
  CAMINHOS,
  CONTORNO,
  ID_DO_ESTADIO,
  LARGURA_DO_CAMPUS,
  PREDIOS,
  type Area,
  type Predio,
} from './predios';
import { LEGENDA, SLUG_DO_CAMPUS, type MarcadorDoBloco } from './urgencia';
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

const DY = { abaixo: '1.15em', centro: '0.35em', acima: '-0.9em' } as const;

function Rotulo({ nome }: { nome: Nome }) {
  return (
    <g transform={`translate(${String(nome.x)} ${String(nome.y)})`}>
      <text dy={DY[nome.lado]} className={estilos.sigla}>
        {nome.texto}
      </text>
    </g>
  );
}

const nomeDoPredio = (p: Predio): Nome => ({
  id: `p${String(p.id)}`,
  texto: p.sigla,
  x: p.rotulo[0],
  y: p.rotulo[1],
  lado: 'abaixo',
});

const nomeDaArea = (a: Area): Nome => {
  const [x = 0, y = 0, largura = 0, altura = 0] = a.caixa;
  return {
    id: `a${String(a.id)}`,
    texto: a.nome,
    x: x + largura / 2,
    y: y + altura / 2,
    lado: a.id === ID_DO_ESTADIO ? 'acima' : 'centro',
  };
};

const tamanho = (p: Predio) => (p.caixa[2] ?? 0) * (p.caixa[3] ?? 0);

function AreaDeToque({ caixa }: { caixa: readonly number[] }) {
  const [x = 0, y = 0, w = 0, h = 0] = caixa;
  return <rect x={x} y={y} width={w} height={h} className={estilos.alvo} />;
}

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
  const [folhaAberta, setFolhaAberta] = useState(false);
  const [legendaAberta, setLegendaAberta] = useState(false);
  const geral = useMemo(() => enquadrar([...porPredio.keys()]), [porPredio]);
  const [comNomes, setComNomes] = useState(false);
  const [todosOsNomes, setTodosOsNomes] = useState(false);
  const [ajudaVisivel, setAjudaVisivel] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem('mapa-ajuda-fechada') === 'sim') setAjudaVisivel(false);
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  const candidatos = useMemo(() => {
    const aberto = sel?.predio;
    const peso = (p: Predio) => {
      const m = porPredio.get(p.id);
      if (!m) return 0;
      return m.abertas > 0 ? 3 : m.pautas.length > 0 ? 2 : 1;
    };
    const outros = PREDIOS.filter(
      (p) =>
        p.sigla &&
        p.id !== aberto?.id &&
        (porPredio.has(p.id) || todosOsNomes || (comNomes && p.blocos.length > 0)),
    ).sort((a, b) => peso(b) - peso(a) || tamanho(b) - tamanho(a));
    const comBloco = outros.filter((p) => peso(p) > 0);
    const semBloco = outros.filter((p) => peso(p) === 0);
    return [
      ...(aberto?.sigla ? [nomeDoPredio(aberto)] : []),
      ...comBloco.map(nomeDoPredio),
      ...AREAS.filter((a) => a.id === ID_DO_ESTADIO).map(nomeDaArea),
      ...(comNomes ? AREAS.filter((a) => a.nome && a.id !== ID_DO_ESTADIO).map(nomeDaArea) : []),
      ...semBloco.map(nomeDoPredio),
    ];
  }, [porPredio, sel, comNomes, todosOsNomes]);

  const [cabem, setCabem] = useState<ReadonlySet<string> | null>(null);
  const escala = useRef<{ k: number; giro: number } | null>(null);
  const candidatosAtuais = useRef(candidatos);
  const decidirNomes = useCallback(() => {
    if (!escala.current) return;
    const novos = nomesQueCabem(candidatosAtuais.current, escala.current.k, escala.current.giro);
    setCabem((antes) =>
      antes?.size === novos.size && [...novos].every((id) => antes.has(id)) ? antes : novos,
    );
  }, []);
  useEffect(() => {
    candidatosAtuais.current = candidatos;
    decidirNomes();
  }, [candidatos, decidirNomes]);

  const [base] = useState(geral);
  const [camera] = useState(() => {
    let ajudaFechada = false;
    return criarCamera(
      base,
      (v, k, giro) => {
        setComNomes(v.w < LARGURA_DO_CAMPUS * 0.3);
        setTodosOsNomes(v.w < LARGURA_DO_CAMPUS * 0.12);
        escala.current = { k, giro };
        decidirNomes();
      },
      () => {
        if (ajudaFechada) return;
        ajudaFechada = true;
        setAjudaVisivel(false);
        try {
          localStorage.setItem('mapa-ajuda-fechada', 'sim');
        } catch {
          // O mapa continua utilizável sem armazenamento local.
        }
      },
    );
  });
  const svg = useRef<SVGSVGElement>(null);
  const camada = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!svg.current || !camada.current) return;
    return camera.ligar(svg.current, camada.current);
  }, [camera]);

  const predios = useMemo(
    () => [...PREDIOS].sort((a, b) => Number(porPredio.has(a.id)) - Number(porPredio.has(b.id))),
    [porPredio],
  );

  const focar = (p: Predio) => {
    camera.focar(visaoDoPredio(p), matchMedia('(min-width: 721px)').matches ? 0.18 : 0);
  };

  const abrirPredio = (p: Predio) => {
    if (sel?.predio?.id === p.id) {
      setSel(null);
      setFolhaAberta(false);
      return;
    }
    setSel({ predio: p, bloco: porPredio.get(p.id) });
    setFolhaAberta(false);
    setLegendaAberta(false);
    setAjudaVisivel(false);
    focar(p);
  };
  const clicarPredio = (p: Predio) => {
    if (!camera.arrastou()) abrirPredio(p);
  };
  const abrirBloco = (m: MarcadorDoBloco) => {
    const p = m.predio ? PREDIOS.find((x) => x.id === m.predio) : undefined;
    setSel({ predio: p, bloco: m });
    setFolhaAberta(false);
    setLegendaAberta(false);
    setAjudaVisivel(false);
    if (p) focar(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const fechar = () => {
    if (!camera.arrastou()) {
      setSel(null);
      setFolhaAberta(false);
    }
  };

  const bloco = sel?.bloco;
  return (
    <>
      <div className={estilos.tela}>
        <svg
          ref={svg}
          {...camera.eventos}
          className={estilos.desenho}
          viewBox={`${String(base.x)} ${String(base.y)} ${String(base.w)} ${String(base.h)}`}
          role="group"
          aria-label="Mapa do campus. A lista abaixo do mapa tem a mesma informação."
          tabIndex={0}
          aria-describedby="atalhos-mapa"
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight + - N"
          onContextMenu={(e) => {
            e.preventDefault();
          }}
        >
          <g ref={camada}>
            <g
              onClick={fechar}
              onDoubleClick={(e) => {
                camera.zoomNoPonteiro(e.shiftKey ? 2 : 0.5, e.clientX, e.clientY);
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
              {AREAS.map((a) => (
                <path key={a.id} d={a.d} className={[estilos.area, estilos[a.tipo]].join(' ')}>
                  {a.nome && <title>{a.nome}</title>}
                </path>
              ))}
              {CAMINHOS.map((d) => (
                <path key={d} d={d} className={estilos.via} />
              ))}
            </g>
            {predios.map((p) => {
              const m = porPredio.get(p.id);
              const aceso = m !== undefined && m.pautas.length > 0;
              const aberto = sel?.predio?.id === p.id;
              const rotulo = m ? `${m.nome}: ${m.linha}` : p.nome;
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
                    m?.urgente ? estilos.predioUrgente : '',
                    p.sigla ? estilos.tocavel : '',
                    m && !aceso ? estilos.semPautas : '',
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
                  {aceso && <path d={p.d} className={estilos.halo} />}
                  <path d={p.d} />
                </g>
              );
            })}
            <g aria-hidden="true">
              {candidatos
                .filter((n) => cabem?.has(n.id) ?? true)
                .map((n) => (
                  <Rotulo key={n.id} nome={n} />
                ))}
            </g>
          </g>
        </svg>

        <p id="atalhos-mapa" className={estilos.somenteLeitor}>
          Atalhos do mapa: setas movem, mais e menos alteram o zoom, Shift com setas gira e N volta
          ao norte.
        </p>

        {/* Ações no topo: legenda (só no celular), enquadrar tudo e ir para a lista. */}
        <div className={estilos.acoesTopo}>
          <button
            type="button"
            className={[estilos.verCampus, estilos.botaoLegenda].join(' ')}
            aria-expanded={legendaAberta}
            aria-controls="legenda-mapa"
            onClick={() => {
              setLegendaAberta((a) => !a);
            }}
          >
            <Icone nome="camadas" />
            Legenda
          </button>
          <button
            type="button"
            className={estilos.verCampus}
            onClick={() => {
              setSel(null);
              setFolhaAberta(false);
              camera.irPara(geral, 0);
            }}
          >
            <Icone nome="mapa" />
            <span className={estilos.longo}>Todos os blocos</span>
            <span className={estilos.curto}>Blocos</span>
          </button>
          <a href="#lista-do-mapa" className={estilos.verCampus}>
            <Icone nome="lista" />
            <span className={estilos.longo}>Ver em lista</span>
            <span className={estilos.curto}>Lista</span>
          </a>
        </div>

        {/* O título fica na página mesmo com a ajuda fechada: é o único h1 do mapa. */}
        {!ajudaVisivel && <h1 className={estilos.somenteLeitor}>Mapa do campus</h1>}
        {ajudaVisivel && (
          <div className={estilos.hudTitulo}>
            <h1 className={estilos.hudNome}>Mapa do campus</h1>
            <ul className={estilos.hudLista}>
              <li>
                <Icone nome="local" />
                <span>Toque num prédio para ver as pautas dele.</span>
              </li>
              <li>
                <Icone nome="mao" />
                <span>Arraste para mover. Com dois dedos, aproxime e gire.</span>
              </li>
              <li className={estilos.dicaPc}>
                <Icone nome="mira" />
                <span>No computador, o botão direito gira e a roda aproxima.</span>
              </li>
            </ul>
            <button
              type="button"
              className={estilos.fecharAjuda}
              aria-label="Fechar ajuda do mapa"
              onClick={() => {
                setAjudaVisivel(false);
                try {
                  localStorage.setItem('mapa-ajuda-fechada', 'sim');
                } catch {
                  /* armazenamento indisponível */
                }
              }}
            >
              <Icone nome="fechar" />
            </button>
          </div>
        )}

        <ul
          id="legenda-mapa"
          className={estilos.legenda}
          data-aberta={legendaAberta || undefined}
          aria-label="Legenda das cores"
        >
          {LEGENDA.map((l) => (
            <li key={l.rotulo}>
              <i className={estilos.ponto} style={{ background: l.cor }} />
              {l.rotulo}
            </li>
          ))}
        </ul>

        <div className={estilos.controles} data-painel={sel !== null || undefined}>
          <div className={estilos.zoom}>
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
              className={estilos.girar}
              aria-label="Girar o mapa para a esquerda"
              onClick={() => {
                camera.girar(-Math.PI / 6);
              }}
            >
              <Icone nome="girarEsquerda" />
            </button>
            <button
              type="button"
              className={estilos.girar}
              aria-label="Girar o mapa para a direita"
              onClick={() => {
                camera.girar(Math.PI / 6);
              }}
            >
              <Icone nome="girarDireita" />
            </button>
            <button
              type="button"
              aria-label="Aproximar o mapa"
              onClick={() => {
                camera.zoom(1 / 1.6);
              }}
            >
              <Icone nome="mais" />
            </button>
            <button
              type="button"
              aria-label="Afastar o mapa"
              onClick={() => {
                camera.zoom(1.6);
              }}
            >
              <Icone nome="menos" />
            </button>
          </div>
        </div>

        <p className={estilos.credito} data-painel={sel !== null || undefined}>
          ©{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            colaboradores do OpenStreetMap
          </a>
        </p>

        <aside
          className={estilos.painel}
          data-aberto={sel !== null}
          data-expandido={folhaAberta || undefined}
          aria-live="polite"
        >
          {sel ? (
            <>
              <button
                type="button"
                className={estilos.alca}
                aria-expanded={folhaAberta}
                aria-label={
                  folhaAberta ? 'Reduzir o painel do bloco' : 'Expandir o painel do bloco'
                }
                onClick={() => {
                  setFolhaAberta((a) => !a);
                }}
              />
              <button
                type="button"
                className={estilos.fechar}
                aria-label="Fechar o painel"
                onClick={() => {
                  setSel(null);
                  setFolhaAberta(false);
                }}
              >
                <Icone nome="fechar" />
              </button>
              <p className={estilos.eyebrow}>
                <Icone nome="local" />
                {sel.predio?.nome ?? 'Bloco'}
              </p>
              <h2 className={estilos.tituloPainel}>{bloco?.nome ?? sel.predio?.sigla}</h2>
              {bloco ? (
                <>
                  <p className={estilos.detalhe}>{bloco.linha}</p>
                  {bloco.pautas.length === 0 ? (
                    <p className={estilos.vazio}>Nenhuma pauta aqui ainda.</p>
                  ) : (
                    <ul className={estilos.pautas}>
                      {bloco.pautas.map((pauta) => {
                        const pct = Math.min(
                          100,
                          Math.round((pauta.apoios / Math.max(1, pauta.meta)) * 100),
                        );
                        const cor = STATUS[pauta.status].ponto;
                        return (
                          <li
                            key={pauta.slug}
                            className={estilos.pauta}
                            style={{ '--c': cor } as CSSProperties}
                          >
                            <StatusPill status={pauta.status} />
                            <Link href={`/p/${pauta.slug}`}>{pauta.titulo}</Link>
                            <span className={estilos.detalhe}>
                              <strong>{formatarNumero(pauta.apoios)}</strong> de{' '}
                              {formatarNumero(pauta.meta)} apoios
                            </span>
                            <div className={estilos.barraPauta} aria-hidden="true">
                              <span style={{ width: `${String(pct)}%` }} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {bloco.slug !== SLUG_DO_CAMPUS && (
                    <Link href={`/?bloco=${bloco.slug}`} className={estilos.verBloco}>
                      <Icone nome="abrir" />
                      Ver as pautas do bloco
                    </Link>
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
