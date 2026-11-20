import type { PautaDetalhe } from '@lumens/contratos';
import { conquistadaEm, oQueFoiFeito, solucaoEntregue } from '../../dados/conquista';
import { diasEntre, textoDias } from '../../dados/dias';
import { formatarNumero } from '../BarraApoios';
import { PlacarDeApoios } from './CabecalhoPauta';
import { urlFoto } from './foto';
import { formatarDia } from './LinhaDoTempo';
import estilos from './pauta.module.css';

// As duas funções moraram aqui; foram para `dados/conquista.ts` (sem CSS) para a imagem do card usá-las.
export { conquistadaEm, solucaoEntregue };

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
        <div>
          <dt>Apoios</dt>
          <dd>{formatarNumero(pauta.apoios)}</dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * O que foi feito: o texto e a foto que a curadoria escreveu (SCRUM-394), com a descrição do
 * caminho executado como texto de reserva, e a data. Sem solução, texto nem foto, não há bloco.
 */
export function SolucaoEntregue({ pauta }: { pauta: PautaDetalhe }) {
  const caminho = solucaoEntregue(pauta);
  const feito = oQueFoiFeito(pauta);
  const foto = feito.foto === null ? null : urlFoto(feito.foto);
  if (!caminho && !feito.texto && !foto) return null;
  const texto = feito.texto ?? (caminho ? 'A proposta da comunidade foi executada.' : null);
  return (
    <section className={estilos.secao} aria-labelledby="solucao-titulo">
      {caminho && <span className={estilos.seloSolucao}>Solução da comunidade</span>}
      <h2 id="solucao-titulo" className={estilos.secaoTitulo}>
        {caminho ? 'Solução entregue' : 'O que foi feito'}
      </h2>
      {texto && <p className={estilos.texto}>{texto}</p>}
      {foto && (
        <figure className={estilos.fotoDoFeito}>
          <img src={foto} alt={`Foto do que foi feito: ${pauta.titulo}`} loading="lazy" />
        </figure>
      )}
      {caminho?.executada_em && (
        <p className={estilos.vazio}>
          Executada em{' '}
          <time dateTime={caminho.executada_em}>{formatarDia(caminho.executada_em)}</time>
        </p>
      )}
    </section>
  );
}
