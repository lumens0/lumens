'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
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
  return (
    <div className={estilos.skyline}>
      <ul className={estilos.predios}>
        {predios.map((predio) => {
          const apagadas = Math.max(0, predio.colunas * predio.linhas - predio.janelas.length);
          return (
            <li
              key={predio.slug}
              className={[
                estilos.predio,
                predio.escolhido ? estilos.escolhido : '',
                haEscolhidos && !predio.escolhido ? estilos.esmaecido : '',
              ].join(' ')}
            >
              <ul
                className={estilos.janelas}
                style={{ '--colunas': predio.colunas } as CSSProperties}
                aria-label={`${predio.nome}: ${String(predio.pautas)} ${predio.pautas === 1 ? 'pauta' : 'pautas'}`}
              >
                {predio.janelas.map((janela) => (
                  <li key={janela.slug}>
                    <button
                      type="button"
                      className={[
                        estilos.janela,
                        estilos[`etapa_${janela.status}`],
                        janela.fora ? estilos.fora : '',
                        aberta?.janela.slug === janela.slug ? estilos.aberta : '',
                      ].join(' ')}
                      style={{ '--cor': STATUS[janela.status].ponto } as CSSProperties}
                      aria-label={nomeDaJanela(janela)}
                      aria-pressed={aberta?.janela.slug === janela.slug}
                      onClick={() => {
                        setAberta(aberta?.janela.slug === janela.slug ? null : { predio, janela });
                      }}
                    />
                  </li>
                ))}
                {Array.from({ length: apagadas }, (_, i) => (
                  <li key={`apagada-${String(i)}`} className={estilos.apagada} aria-hidden="true" />
                ))}
              </ul>
              <span className={estilos.sigla} title={predio.nome}>
                {predio.sigla}
                {predio.mais > 0 && <small> +{predio.mais}</small>}
              </span>
            </li>
          );
        })}
      </ul>
      <div className={estilos.legenda} aria-live="polite">
        {aberta ? (
          <>
            <p className={estilos.legendaEtapa}>
              <i
                className={estilos.janelaMini}
                style={{ background: STATUS[aberta.janela.status].ponto }}
                aria-hidden="true"
              />
              <span className={estilos.rotuloPequeno}>Etapa</span>{' '}
              {STATUS[aberta.janela.status].rotulo}
            </p>
            <p className={estilos.legendaPauta}>
              <span className={estilos.rotuloPequeno}>Pauta</span> {aberta.janela.titulo}
            </p>
            <p className={estilos.legendaAcoes}>
              <Link href={`/p/${aberta.janela.slug}`}>Abrir pauta</Link>
              <span aria-hidden="true"> — </span>
              <Link href={urlDeFiltros('/pautas', { bloco: [aberta.predio.slug] })}>
                Ver na lista
              </Link>
              <span aria-hidden="true"> — </span>
              <Link href="/mapa">Ver no mapa</Link>
            </p>
          </>
        ) : (
          <p className={estilos.legendaTexto}>{legenda}</p>
        )}
      </div>
    </div>
  );
}
