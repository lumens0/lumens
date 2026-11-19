import type { PautaDetalhe } from '@lumens/contratos';
import { FotosDoRelato } from './FotosDoRelato';
import { urlFoto as urlFotoPadrao } from './foto';
import estilos from './pauta.module.css';

/** Relatos aprovados: texto e curso, nunca quem relatou. */
export function Relatos({
  relatos,
  urlFoto = urlFotoPadrao,
}: {
  relatos: PautaDetalhe['relatos'];
  urlFoto?: (chave: string) => string | null;
}) {
  return (
    <section className={estilos.secao} aria-labelledby="relatos-titulo">
      <h2 id="relatos-titulo" className={estilos.secaoTitulo}>
        Relatos
      </h2>
      {relatos.length === 0 ? (
        <p className={estilos.vazio}>Ainda não tem relato publicado nesta pauta.</p>
      ) : (
        <ul className={estilos.lista}>
          {relatos.map((relato, i) => {
            // Até três fotos por relato; chave fora do formato do bot não vira endereço.
            const fotos = relato.fotos.flatMap((chave) => {
              const url = urlFoto(chave);
              return url === null ? [] : [url];
            });
            return (
              <li key={i} className={estilos.relato}>
                <div className={estilos.relatoCorpo}>
                  <p className={estilos.texto}>{relato.texto}</p>
                  {relato.curso && <p className={estilos.curso}>{relato.curso}</p>}
                </div>
                {/* Miniaturas lado a lado; a foto inteira abre na própria página (diálogo). */}
                {fotos.length > 0 && <FotosDoRelato urls={fotos} texto={relato.texto} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
