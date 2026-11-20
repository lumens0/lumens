import type { ApoioSemana } from '@lumens/contratos';
import type { CSSProperties } from 'react';
import { graficoSemanal, type GraficoSemanal } from '../dados/semanas';
import estilos from './semanas.module.css';

/**
 * A frase de baixo do gráfico, como no protótipo: "N apoios nesta semana, X% a mais que na
 * anterior." Com poucos dados (ou nenhum), vale o resumo de `graficoSemanal`.
 */
function legendaDoGrafico(grafico: GraficoSemanal) {
  if (grafico.estado !== 'normal') return grafico.resumo;
  const [anterior, atual] = grafico.colunas.slice(-2);
  if (!atual) return grafico.resumo;
  const agora = <b>{atual.apoios} apoios</b>;
  if (!anterior || anterior.apoios === 0) return <>{agora} nesta semana.</>;
  const pc = Math.round(((atual.apoios - anterior.apoios) / anterior.apoios) * 100);
  return (
    <>
      {agora} nesta semana, {pc >= 0 ? `${String(pc)}% a mais` : `${String(-pc)}% a menos`} que na
      anterior.
    </>
  );
}

/**
 * "Apoios por semana" (SCRUM-360): barras das últimas 8 semanas, a atual em âmbar. HTML e CSS, sem
 * biblioteca. Os valores estão escritos em cima de cada barra e numa tabela só para leitor de
 * tela; as barras em si ficam escondidas dele.
 */
export function ApoiosPorSemana({ semanas }: { semanas: readonly ApoioSemana[] }) {
  const grafico = graficoSemanal(semanas);
  return (
    <section className={estilos.semanas} aria-labelledby="semanas-titulo">
      <h2 id="semanas-titulo" className={estilos.titulo}>
        Apoios por semana
      </h2>
      {grafico.estado !== 'vazio' && (
        <>
          <ol className={estilos.colunas} aria-hidden="true">
            {grafico.colunas.map((coluna, i) => (
              <li
                key={coluna.semana}
                className={[estilos.coluna, coluna.atual ? estilos.agora : ''].join(' ')}
                style={{ '--f': (coluna.altura / 100).toFixed(3), '--i': i } as CSSProperties}
              >
                <b className={estilos.valor}>{coluna.apoios}</b>
                <i className={estilos.barra} />
                <small className={estilos.rotulo}>{coluna.rotulo}</small>
              </li>
            ))}
          </ol>
          <div className={estilos.somenteLeitor}>
            <table>
              <caption>Apoios por semana, da mais antiga à atual</caption>
              <thead>
                <tr>
                  <th scope="col">Semana de</th>
                  <th scope="col">Apoios</th>
                </tr>
              </thead>
              <tbody>
                {grafico.colunas.map((coluna) => (
                  <tr key={coluna.semana}>
                    <th scope="row">{coluna.atual ? 'Esta semana' : coluna.rotulo}</th>
                    <td>{coluna.apoios}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className={estilos.resumo}>{legendaDoGrafico(grafico)}</p>
    </section>
  );
}
