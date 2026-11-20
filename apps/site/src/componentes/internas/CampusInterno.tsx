import {
  ALTURA_DO_CAMPUS,
  AREAS,
  CAMINHOS,
  CONTORNO,
  LARGURA_DO_CAMPUS,
  PREDIOS,
} from '../mapa/predios';
import estilos from './internas.module.css';

/**
 * O campus inteiro, à noite, para o fundo das páginas internas (SCRUM-374). Renderizado no servidor
 * para não levar o contorno do OpenStreetMap no pacote de JavaScript do navegador; quem acende cada
 * prédio é o `ligarFundo`. Decorativo: a mesma informação está nos itens da página.
 */
export function CampusInterno() {
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
      {PREDIOS.map((p) => (
        <path key={p.id} d={p.d} className={estilos.predio} data-predio={p.id} />
      ))}
    </svg>
  );
}
