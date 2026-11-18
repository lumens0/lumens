import type { Caminho, PautaDetalhe } from '@lumens/contratos';
import { diasEntre, textoDias } from '../../dados/dias';
import { PlacarDeApoios } from './CabecalhoPauta';
import { formatarDia } from './LinhaDoTempo';
import estilos from './pauta.module.css';

/** Quando a pauta virou conquista: o último evento de status para `conquistada`. */
export function conquistadaEm(pauta: PautaDetalhe): string | undefined {
  return pauta.linha_do_tempo.findLast(
    (evento) => evento.tipo === 'status_alterado' && evento.dados.para === 'conquistada',
  )?.criado_em;
}

/** A solução da comunidade que foi executada, se a pauta teve uma. */
export function solucaoEntregue(pauta: PautaDetalhe): Caminho | undefined {
  return pauta.caminhos.findLast(
    (caminho) =>
      caminho.tipo === 'proposta' && (caminho.status === 'executada' || caminho.executada_em),
  );
}

/**
 * A vitória no topo da pauta conquistada (SCRUM-352): selo, data da conquista, apoios e dias da
 * criação à entrega. Dado que falta (sem evento de conquista, sem data) some, sem "NaN dias".
 */
export function DestaqueDaConquista({ pauta }: { pauta: PautaDetalhe }) {
  const quando = conquistadaEm(pauta);
  const dias = diasEntre(pauta.criada_em, quando);
  return (
    <section
      className={[estilos.secao, estilos.conquista].join(' ')}
      aria-labelledby="conquista-titulo"
    >
      <span className={estilos.seloConquista}>Conquistada</span>
      <h2 id="conquista-titulo" className={estilos.conquistaTitulo}>
        A comunidade conquistou esta pauta
      </h2>
      <PlacarDeApoios pauta={pauta} />
      {(quando || dias !== null) && (
        <dl className={estilos.fatos}>
          {quando && (
            <div>
              <dt>Conquistada em</dt>
              <dd>
                <time dateTime={quando}>{formatarDia(quando)}</time>
              </dd>
            </div>
          )}
          {dias !== null && (
            <div>
              <dt>Da criação à entrega</dt>
              <dd>{textoDias(dias)}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

/** O que foi feito: a descrição do caminho executado e a data. Sem solução, não há bloco. */
export function SolucaoEntregue({ pauta }: { pauta: PautaDetalhe }) {
  const caminho = solucaoEntregue(pauta);
  if (!caminho) return null;
  return (
    <section className={estilos.secao} aria-labelledby="solucao-titulo">
      <span className={estilos.seloSolucao}>Solução da comunidade</span>
      <h2 id="solucao-titulo" className={estilos.secaoTitulo}>
        Solução entregue
      </h2>
      <p className={estilos.texto}>
        {caminho.descricao ?? 'A proposta da comunidade foi executada.'}
      </p>
      {caminho.executada_em && (
        <p className={estilos.vazio}>
          Executada em{' '}
          <time dateTime={caminho.executada_em}>{formatarDia(caminho.executada_em)}</time>
        </p>
      )}
    </section>
  );
}
