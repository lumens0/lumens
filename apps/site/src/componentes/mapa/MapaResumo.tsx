import { ALTURA_DO_CAMPUS, CAMINHOS, CONTORNO, LARGURA_DO_CAMPUS, PREDIOS } from './predios';
import type { MarcadorDoBloco } from './urgencia';
import estilos from './mapa.module.css';

const PROPORCAO = LARGURA_DO_CAMPUS / ALTURA_DO_CAMPUS;

/**
 * `viewBox` que mostra os prédios acesos com folga, na proporção do quadro. Sem prédio aceso, o
 * campus inteiro.
 */
export function enquadrar(ids: readonly number[]): { x: number; y: number; w: number; h: number } {
  const caixas = PREDIOS.filter((p) => ids.includes(p.id)).map((p) => p.caixa);
  if (caixas.length === 0) return { x: 0, y: 0, w: LARGURA_DO_CAMPUS, h: ALTURA_DO_CAMPUS };
  const x0 = Math.min(...caixas.map(([x = 0]) => x));
  const y0 = Math.min(...caixas.map(([, y = 0]) => y));
  const x1 = Math.max(...caixas.map(([x = 0, , w = 0]) => x + w));
  const y1 = Math.max(...caixas.map(([, y = 0, , h = 0]) => y + h));
  let w = Math.max(x1 - x0, 400) * 1.5;
  let h = Math.max(y1 - y0, 300) * 1.5;
  if (w / h > PROPORCAO) h = w / PROPORCAO;
  else w = h * PROPORCAO;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

const viewBox = ({ x, y, w, h }: ReturnType<typeof enquadrar>) =>
  [x, y, w, h].map((v) => String(Math.round(v))).join(' ');

/**
 * O campus, parado, com os prédios que têm pauta acesos na cor da mais urgente. É a
 * vitrine da home; o mapa que se usa é o da página /mapa.
 */
export function MapaResumo({ marcadores }: { marcadores: readonly MarcadorDoBloco[] }) {
  const cores = new Map(marcadores.flatMap((m) => (m.predio ? [[m.predio, m.cor] as const] : [])));
  let acesos = 0;
  return (
    <svg
      className={estilos.resumo}
      viewBox={viewBox(enquadrar([...cores.keys()]))}
      aria-hidden="true"
    >
      <path d={CONTORNO} className={estilos.terreno} />
      {CAMINHOS.map((d) => (
        <path key={d} d={d} className={estilos.caminho} />
      ))}
      {PREDIOS.map((p) =>
        cores.has(p.id) ? null : <path key={p.id} d={p.d} className={estilos.apagado} />,
      )}
      {PREDIOS.filter((p) => cores.has(p.id)).map((p) => {
        acesos += 1;
        const [x = 0, y = 0, w = 0, h = 0] = p.caixa;
        const atraso = `${String(300 + acesos * 160)}ms`;
        return (
          <g key={p.id}>
            <path
              d={p.d}
              className={estilos.aceso}
              style={{ fill: cores.get(p.id), color: cores.get(p.id), animationDelay: atraso }}
            />
            <text
              x={x + w / 2}
              y={y + h + 32}
              className={estilos.rotuloResumo}
              style={{ animationDelay: atraso }}
            >
              {p.sigla}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
