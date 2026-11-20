'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { urlDeFiltros } from '../../dados/filtros';
import { janelaVigente, type JanelaDoPredio, type PredioDoSkyline } from '../../dados/skyline';
import { STATUS } from '../StatusPill';
import estilos from './inicio.module.css';

/** Texto que o leitor de tela lê na janela: o título, a etapa e os apoios. */
export function nomeDaJanela(janela: JanelaDoPredio): string {
  const apoios = `${String(janela.apoios)} ${janela.apoios === 1 ? 'apoio' : 'apoios'}`;
  return `${janela.titulo}, ${STATUS[janela.status].rotulo}, ${apoios}`;
}

/**
 * Onde cada janela acesa fica no prédio: espalhadas pelas células (a j-ésima ocupa a célula do meio da
 * j-ésima fatia), como no protótipo, e não amontoadas no começo.
 */
export function posicoesDasJanelas(total: number, acesas: number): (number | null)[] {
  const celulas: (number | null)[] = Array.from({ length: total }, () => null);
  for (let j = 0; j < acesas; j++) celulas[Math.floor(((j + 0.5) * total) / acesas)] = j;
  return celulas;
}

/**
 * O campus ao anoitecer: cada prédio é um bloco e cada janela acesa é uma pauta, na cor da etapa.
 * Tocar (ou focar e apertar Enter) numa janela mostra a pauta na legenda, com os caminhos para ela.
 * A legenda é uma região viva: o leitor de tela ouve o que mudou.
 */
export function Skyline({ predios, legenda }: { predios: PredioDoSkyline[]; legenda: string }) {
  const [escolhida, setAberta] = useState<{
    predio: PredioDoSkyline;
    janela: JanelaDoPredio;
  } | null>(null);
  const aberta = janelaVigente(escolhida, predios);
  const haEscolhidos = predios.some((p) => p.escolhido);
  const raiz = useRef<HTMLDivElement>(null);

  // A luz acompanha o ponteiro: janelas por perto brilham mais.
  useEffect(() => {
    const el = raiz.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let quadro = 0;
    let x = -1e4;
    let y = -1e4;
    const brilhar = () => {
      quadro = 0;
      for (const janela of el.querySelectorAll<HTMLElement>('button[data-janela]')) {
        const r = janela.getBoundingClientRect();
        const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
        janela.style.setProperty('--g', Math.min(1, Math.max(0, 1 - d / 110)).toFixed(2));
      }
    };
    const agendar = () => {
      if (quadro === 0) quadro = requestAnimationFrame(brilhar);
    };
    const mover = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      agendar();
    };
    const sair = () => {
      x = y = -1e4;
      agendar();
    };
    el.addEventListener('pointermove', mover);
    el.addEventListener('pointerleave', sair);
    return () => {
      cancelAnimationFrame(quadro);
      el.removeEventListener('pointermove', mover);
      el.removeEventListener('pointerleave', sair);
    };
  }, []);

  let ordem = 0;
  return (
    <div className={estilos.skyline} ref={raiz}>
      <div className={estilos.legenda} aria-live="polite">
        {aberta ? (
          <>
            <p className={estilos.legendaEtapa}>
              <span className={estilos.rotuloPequeno}>Etapa</span>
              <i
                className={estilos.janelaMini}
                style={{ '--cor': STATUS[aberta.janela.status].ponto } as CSSProperties}
                aria-hidden="true"
              />
              {STATUS[aberta.janela.status].rotulo}
            </p>
            <p className={estilos.legendaPauta}>
              <span className={estilos.rotuloPequeno}>Pauta</span>
              {aberta.janela.titulo}
            </p>
            <p className={estilos.legendaAcoes}>
              <Link href={`/p/${aberta.janela.slug}`}>Abrir pauta</Link>
              <Link href={urlDeFiltros('/pautas', { bloco: [aberta.predio.slug] })}>
                Ver na lista
              </Link>
              <Link href="/mapa">Ver no mapa</Link>
            </p>
          </>
        ) : (
          <p className={estilos.legendaTexto}>{legenda}</p>
        )}
      </div>
      <ul className={estilos.predios}>
        {predios.map((predio) => {
          const celulas = posicoesDasJanelas(predio.colunas * predio.linhas, predio.janelas.length);
          return (
            <li
              key={predio.slug}
              className={[
                estilos.predio,
                predio.escolhido ? estilos.escolhido : '',
                haEscolhidos && !predio.escolhido ? estilos.esmaecido : '',
              ].join(' ')}
            >
              <span className={estilos.sigla} title={predio.nome}>
                {predio.sigla}
                {predio.mais > 0 && <small> +{predio.mais}</small>}
              </span>
              <ul
                className={estilos.janelas}
                style={{ '--colunas': predio.colunas } as CSSProperties}
                aria-label={`${predio.nome}: ${String(predio.pautas)} ${predio.pautas === 1 ? 'pauta' : 'pautas'}`}
              >
                {celulas.map((indice, i) => {
                  const janela = indice === null ? undefined : predio.janelas[indice];
                  if (!janela) {
                    return (
                      <li
                        key={`apagada-${String(i)}`}
                        className={estilos.apagada}
                        aria-hidden="true"
                      />
                    );
                  }
                  const atraso = ordem++ * 90 + 200;
                  return (
                    <li key={janela.slug}>
                      <button
                        type="button"
                        data-janela=""
                        className={[
                          estilos.janela,
                          estilos[`etapa_${janela.status}`],
                          janela.fora ? estilos.fora : '',
                          aberta?.janela.slug === janela.slug ? estilos.aberta : '',
                        ].join(' ')}
                        style={
                          {
                            '--cor': STATUS[janela.status].ponto,
                            '--d': `${String(atraso)}ms`,
                          } as CSSProperties
                        }
                        aria-label={nomeDaJanela(janela)}
                        aria-pressed={aberta?.janela.slug === janela.slug}
                        onClick={() => {
                          setAberta(
                            aberta?.janela.slug === janela.slug ? null : { predio, janela },
                          );
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
