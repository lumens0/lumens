'use client';

import Link from 'next/link';
import { useState } from 'react';
import { STATUS, StatusPill } from '../StatusPill';
import { formatarNumero } from '../BarraApoios';
import { ALTURA_DO_CAMPUS, LARGURA_DO_CAMPUS, VIAS, type Predio } from './predios';
import type { Lugar } from './urgencia';
import estilos from './mapa.module.css';

const contagem = (n: number) => (n === 1 ? '1 pauta' : `${String(n)} pautas`);

const FOLGA = 12;

/** Retângulo invisível em volta do prédio: o clique não cai no vão entre as partes dele. */
function AreaDeClique({ retangulos }: { retangulos: Predio['retangulos'] }) {
  const xs = retangulos.flatMap(([x, , w]) => [x, x + w]);
  const ys = retangulos.flatMap(([, y, , h]) => [y, y + h]);
  const x = Math.min(...xs) - FOLGA;
  const y = Math.min(...ys) - FOLGA;
  return (
    <rect
      className={estilos.areaDeClique}
      x={x}
      y={y}
      width={Math.max(...xs) + FOLGA - x}
      height={Math.max(...ys) + FOLGA - y}
    />
  );
}

/**
 * Mapa do campus com cada prédio colorido pela pauta mais urgente (RF-S10) e, ao lado, a lista
 * com a mesma informação. Clicar num prédio (ou no nome dele na lista) filtra a lista para ele.
 */
export function MapaDoCampus({ lugares }: { lugares: Lugar[] }) {
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const comPautas = lugares.filter((l) => l.pautas.length > 0);
  const visiveis = escolhido ? comPautas.filter((l) => l.nome === escolhido) : comPautas;
  const alternar = (nome: string) => {
    setEscolhido((atual) => (atual === nome ? null : nome));
  };

  return (
    <div className={estilos.mapa}>
      <svg
        className={estilos.desenho}
        viewBox={`0 0 ${String(LARGURA_DO_CAMPUS)} ${String(ALTURA_DO_CAMPUS)}`}
        role="group"
        aria-label="Mapa do campus. A lista ao lado tem a mesma informação."
      >
        <rect width={LARGURA_DO_CAMPUS} height={ALTURA_DO_CAMPUS} className={estilos.chao} />
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
        {lugares.map(({ predio, nome, pautas, urgente }) => {
          if (!predio) return null;
          const cor = urgente ? STATUS[urgente.status] : undefined;
          const rotulo = urgente
            ? `${nome}: ${contagem(pautas.length)}, a mais urgente está como ${STATUS[urgente.status].rotulo}`
            : `${nome}: sem pautas`;
          const props = urgente
            ? {
                role: 'button' as const,
                tabIndex: 0,
                onClick: () => {
                  alternar(nome);
                },
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    alternar(nome);
                  }
                },
              }
            : {};
          return (
            <g
              key={predio.id}
              className={escolhido === nome ? estilos.escolhido : estilos.predio}
              aria-label={rotulo}
              {...props}
            >
              <title>{rotulo}</title>
              {urgente && <AreaDeClique retangulos={predio.retangulos} />}
              {/* Desenho fixo: o índice basta de chave (dois retângulos podem começar no mesmo ponto). */}
              {predio.retangulos.map(([x, y, w, h], i) => (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={4}
                  style={cor ? { fill: cor.fundo, stroke: cor.texto } : undefined}
                />
              ))}
            </g>
          );
        })}
      </svg>

      <section className={estilos.lista} aria-labelledby="lista-mapa">
        <h2 id="lista-mapa" className={estilos.tituloLista}>
          {escolhido ?? 'Onde estão as pautas'}
        </h2>
        {escolhido && (
          <button
            type="button"
            className={estilos.voltar}
            onClick={() => {
              setEscolhido(null);
            }}
          >
            Ver todos os lugares
          </button>
        )}
        {visiveis.length === 0 ? (
          <p>Nenhuma pauta aberta por enquanto.</p>
        ) : (
          <ul className={estilos.lugares}>
            {visiveis.map(({ nome, pautas, urgente }) => (
              <li key={nome}>
                <button
                  type="button"
                  className={estilos.lugar}
                  aria-pressed={escolhido === nome}
                  onClick={() => {
                    alternar(nome);
                  }}
                >
                  <span>{nome}</span>
                  <span className={estilos.contagem}>{contagem(pautas.length)}</span>
                </button>
                {urgente && (
                  <p className={estilos.urgente}>
                    Mais urgente: <StatusPill status={urgente.status} />
                  </p>
                )}
                <ul className={estilos.pautas}>
                  {pautas.map((p) => (
                    <li key={p.slug}>
                      <Link href={`/p/${p.slug}`}>{p.titulo}</Link>{' '}
                      <span className={estilos.contagem}>
                        · {STATUS[p.status].rotulo} · {formatarNumero(p.apoios)} apoios
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
