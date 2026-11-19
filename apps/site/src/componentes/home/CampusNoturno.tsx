import type { CSSProperties } from 'react';
import {
  ALTURA_DO_CAMPUS,
  AREAS,
  CAMINHOS,
  CONTORNO,
  LARGURA_DO_CAMPUS,
  PREDIOS,
} from '../mapa/predios';
import { maisUrgente, type MarcadorDoBloco } from '../mapa/urgencia';
import estilos from './home.module.css';

/**
 * O campus inteiro, à noite, para ficar fixo atrás da home (SCRUM-374). Os prédios com pauta levam
 * `data-luz` e a cor do status mais urgente; quem acende cada um, e quando, é o `Cinema`. Decorativo:
 * a mesma informação está nas cenas e na lista.
 */
export function CampusNoturno({ marcadores }: { marcadores: readonly MarcadorDoBloco[] }) {
  const luzes = new Map(
    marcadores.flatMap((m) => (m.predio === undefined ? [] : [[m.predio, m] as const])),
  );
  return (
    <svg
      className={estilos.campus}
      viewBox={`0 0 ${String(LARGURA_DO_CAMPUS)} ${String(ALTURA_DO_CAMPUS)}`}
      aria-hidden="true"
      focusable="false"
    >
      <path d={CONTORNO} className={estilos.terreno} />
      {AREAS.map((a) => (
        <path key={a.id} d={a.d} className={estilos.area} />
      ))}
      {CAMINHOS.map((d) => (
        <path key={d} d={d} className={estilos.caminho} />
      ))}
      {PREDIOS.map((p) => {
        const m = luzes.get(p.id);
        return m ? (
          <path
            key={p.id}
            d={p.d}
            className={estilos.predio}
            data-predio={p.id}
            data-luz=""
            data-cor={m.cor}
            data-etapa={maisUrgente(m.pautas)?.status ?? 'conquistada'}
            style={{ '--cor': m.cor } as CSSProperties}
          />
        ) : (
          <path key={p.id} d={p.d} className={estilos.predio} data-predio={p.id} />
        );
      })}
    </svg>
  );
}
