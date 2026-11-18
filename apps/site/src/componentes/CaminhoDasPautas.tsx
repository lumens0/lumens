import { caminhoDasPautas, resumoDoCaminho } from '../dados/caminho';
import type { Pauta } from '../dados/tipos';
import { STATUS } from './StatusPill';
import estilos from './caminho.module.css';

/**
 * "Caminho das pautas" (SCRUM-360): quantas pautas estão em cada etapa, em barras horizontais, sem
 * biblioteca. Cada linha tem o rótulo e o número em texto; a barra é só reforço visual, então a cor
 * nunca é o único sinal.
 */
export function CaminhoDasPautas({ pautas }: { pautas: readonly Pauta[] }) {
  const etapas = caminhoDasPautas(pautas);
  return (
    <section className={estilos.caminho} aria-labelledby="caminho-titulo">
      <h2 id="caminho-titulo" className={estilos.titulo}>
        Caminho das pautas
      </h2>
      <ul className={estilos.linhas}>
        {etapas.map((etapa) => (
          <li key={etapa.status} className={estilos.linha}>
            <span className={estilos.nome}>{STATUS[etapa.status].rotulo}</span>
            <span className={estilos.trilho} aria-hidden="true">
              <i
                className={estilos.barra}
                style={{
                  width: `${String(etapa.largura)}%`,
                  background: STATUS[etapa.status].ponto,
                }}
              />
            </span>
            <span className={estilos.valor}>{etapa.total}</span>
          </li>
        ))}
      </ul>
      <p className={estilos.resumo}>{resumoDoCaminho(etapas)}</p>
    </section>
  );
}
