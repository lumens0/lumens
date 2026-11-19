import type { CSSProperties } from 'react';
import type { Grupo } from '../dados/distribuicao';
import { resumoDosGrupos } from '../dados/distribuicao';
import estilos from './caminho.module.css';

/**
 * Barras horizontais de apoios por categoria ou por bloco (SCRUM-360), no mesmo desenho do caminho.
 * Rótulo e número ficam em texto; a barra é reforço visual, no azul-noite, com o mesmo acabamento das barras de etapa (a cor viva fica para o status).
 */
export function PautasPorGrupo({
  id,
  titulo,
  vazio,
  grupos,
}: {
  id: string;
  titulo: string;
  vazio: string;
  grupos: readonly Grupo[];
}) {
  return (
    <section className={estilos.caminho} aria-labelledby={id}>
      <h2 id={id} className={estilos.titulo}>
        {titulo}
      </h2>
      <ul className={estilos.linhas}>
        {grupos.map((grupo) => (
          <li key={grupo.chave} className={estilos.linha}>
            <span className={estilos.nome}>{grupo.rotulo}</span>
            <span className={estilos.trilho} aria-hidden="true">
              <i
                className={estilos.barra}
                style={
                  { width: `${String(grupo.largura)}%`, '--cor': 'var(--noite-2)' } as CSSProperties
                }
              />
            </span>
            <span className={estilos.valor}>{grupo.total}</span>
          </li>
        ))}
      </ul>
      <p className={estilos.resumo}>{resumoDosGrupos(grupos, vazio)}</p>
    </section>
  );
}
