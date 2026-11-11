'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { formatarNumero } from '../BarraApoios';
import { StatusPill } from '../StatusPill';
import { ALTURA_DO_CAMPUS, LARGURA_DO_CAMPUS, PREDIOS, VIAS, type Predio } from './predios';
import { LEGENDA, type MarcadorDoBloco } from './urgencia';
import estilos from './mapa.module.css';

type Visao = { x: number; y: number; w: number; h: number };

const CAMPUS: Visao = { x: 0, y: 0, w: LARGURA_DO_CAMPUS, h: ALTURA_DO_CAMPUS };
const DURACAO_MS = 550;

/** Enquadra o prédio com folga, mantendo a proporção do desenho. */
function visaoDoPredio(predio: Predio): Visao {
  const xs = predio.retangulos.flatMap(([x, , w]) => [x, x + w]);
  const ys = predio.retangulos.flatMap(([, y, , h]) => [y, y + h]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const tamanho = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const w = Math.min(LARGURA_DO_CAMPUS, Math.max(520, tamanho * 4));
  const h = (w * ALTURA_DO_CAMPUS) / LARGURA_DO_CAMPUS;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Sigla do prédio logo abaixo dele, num tamanho que acompanha o zoom. */
function Sigla({ predio, tamanho }: { predio: Predio; tamanho: number }) {
  const xs = predio.retangulos.flatMap(([x, , w]) => [x, x + w]);
  const fundo = Math.max(...predio.retangulos.map(([, y, , h]) => y + h));
  return (
    <text
      x={(Math.min(...xs) + Math.max(...xs)) / 2}
      y={fundo + tamanho * 1.1}
      fontSize={tamanho}
      className={estilos.sigla}
      aria-hidden="true"
    >
      {predio.sigla}
    </text>
  );
}

/** Anima o `viewBox` até `alvo`; sem animação para quem pediu menos movimento. */
function useVisaoAnimada(alvo: Visao): Visao {
  const [visao, setVisao] = useState(alvo);
  const atual = useRef(alvo);
  useEffect(() => {
    const de = atual.current;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      atual.current = alvo;
      setVisao(alvo);
      return;
    }
    const inicio = performance.now();
    let quadro = 0;
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
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => {
      cancelAnimationFrame(quadro);
    };
  }, [alvo]);
  return visao;
}

/**
 * Mapa do campus (RF-S10). Cada prédio ligado a um bloco tem a cor da pauta mais urgente dele;
 * clicar no prédio aproxima o mapa e mostra as pautas daquele bloco ao lado. A lista embaixo tem
 * a mesma informação e também escolhe o bloco.
 */
export function MapaDoCampus({ marcadores }: { marcadores: MarcadorDoBloco[] }) {
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const porPredio = new Map(marcadores.flatMap((m) => (m.predio ? [[m.predio, m] as const] : [])));
  const bloco = marcadores.find((m) => m.slug === escolhido);
  const predio = bloco?.predio ? PREDIOS.find((p) => p.id === bloco.predio) : undefined;
  const [alvo, setAlvo] = useState<Visao>(CAMPUS);
  const visao = useVisaoAnimada(alvo);
  // Com o campus inteiro na tela, os nomes se amontoam; aparecem quando o mapa aproxima.
  const comNomes = visao.w < LARGURA_DO_CAMPUS / 2;

  const escolher = (slug: string | null) => {
    setEscolhido(slug);
    const m = marcadores.find((x) => x.slug === slug);
    const p = m?.predio ? PREDIOS.find((x) => x.id === m.predio) : undefined;
    setAlvo(p ? visaoDoPredio(p) : CAMPUS);
  };

  return (
    <>
      <div className={estilos.palco}>
        <div className={estilos.mapa}>
          <svg
            className={estilos.desenho}
            viewBox={`${String(visao.x)} ${String(visao.y)} ${String(visao.w)} ${String(visao.h)}`}
            role="group"
            aria-label="Mapa do campus. A lista abaixo tem a mesma informação."
          >
            <rect
              x={-LARGURA_DO_CAMPUS}
              y={-ALTURA_DO_CAMPUS}
              width={LARGURA_DO_CAMPUS * 3}
              height={ALTURA_DO_CAMPUS * 3}
              className={estilos.chao}
            />
            {VIAS.map(([x, y, w, h]) => (
              <rect
                key={`${String(x)}-${String(y)}`}
                x={x}
                y={y}
                width={w}
                height={h}
                className={estilos.via}
              />
            ))}
            {PREDIOS.map((p) => {
              const m = porPredio.get(p.id);
              const rotulo = m ? `${m.nome}: ${m.linha}` : p.nome;
              const clicavel = m
                ? {
                    role: 'button' as const,
                    tabIndex: 0,
                    'aria-pressed': escolhido === m.slug,
                    onClick: () => {
                      escolher(escolhido === m.slug ? null : m.slug);
                    },
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        escolher(escolhido === m.slug ? null : m.slug);
                      }
                    },
                  }
                : {};
              return (
                <g
                  key={p.id}
                  className={m && escolhido === m.slug ? estilos.escolhido : estilos.predio}
                  aria-label={rotulo}
                  style={m ? { fill: `${m.cor}38`, stroke: m.cor } : undefined}
                  {...clicavel}
                >
                  <title>{rotulo}</title>
                  {/* Desenho fixo: o índice basta de chave (dois retângulos podem começar no mesmo ponto). */}
                  {p.retangulos.map(([x, y, w, h], i) => (
                    <rect key={i} x={x} y={y} width={w} height={h} rx={4} />
                  ))}
                  {comNomes && <Sigla predio={p} tamanho={visao.w / 70} />}
                </g>
              );
            })}
          </svg>
          {bloco && (
            <button
              type="button"
              className={estilos.verCampus}
              onClick={() => {
                escolher(null);
              }}
            >
              Ver campus inteiro
            </button>
          )}
        </div>

        <aside className={estilos.painel} aria-live="polite">
          {bloco ? (
            <>
              <p className={estilos.eyebrow}>{predio?.sigla ?? 'Bloco'}</p>
              <h2 className={estilos.tituloPainel}>{bloco.nome}</h2>
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
              <h2 className={estilos.tituloPainel}>Escolha um bloco</h2>
              <p className={estilos.detalhe}>
                Toque num prédio colorido para ver as pautas de lá. Os cinza não têm bloco
                cadastrado.
              </p>
            </>
          )}
        </aside>
      </div>

      <ul className={estilos.legenda} aria-label="Legenda das cores">
        {LEGENDA.map((l) => (
          <li key={l.rotulo}>
            <i className={estilos.ponto} style={{ background: l.cor }} />
            {l.rotulo}
          </li>
        ))}
      </ul>

      <h2 className={estilos.tituloLista}>A mesma informação, em lista</h2>
      <ul className={estilos.lista}>
        {marcadores.map((m) => (
          <li key={m.slug}>
            <button
              type="button"
              className={estilos.linha}
              aria-pressed={escolhido === m.slug}
              onClick={() => {
                escolher(escolhido === m.slug ? null : m.slug);
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
    </>
  );
}
