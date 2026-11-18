import type { ApoioSemana } from '@lumens/contratos';
import { graficoSemanal } from '../dados/semanas';
import estilos from './semanas.module.css';

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
            {grafico.colunas.map((coluna) => (
              <li
                key={coluna.semana}
                className={[estilos.coluna, coluna.atual ? estilos.agora : ''].join(' ')}
              >
                <span className={estilos.haste}>
                  <i className={estilos.barra} style={{ height: `${String(coluna.altura)}%` }}>
                    <em className={estilos.valor}>{coluna.apoios}</em>
                  </i>
                </span>
                <small className={estilos.rotulo}>{coluna.rotulo}</small>
              </li>
            ))}
          </ol>
          <table className={estilos.somenteLeitor}>
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
        </>
      )}
      <p className={estilos.resumo}>{grafico.resumo}</p>
    </section>
  );
}
