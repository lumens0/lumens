import type { PautaDetalhe } from '@lumens/contratos';
import { altDaFoto, urlFoto as urlFotoPadrao } from './foto';
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
                {/* Miniaturas lado a lado: cada foto inteira abre ao clicar, numa aba nova. */}
                {fotos.length > 0 && (
                  <ul className={estilos.fotos} aria-label="Fotos do relato">
                    {fotos.map((foto, j) => (
                      <li key={foto}>
                        <a
                          href={foto}
                          target="_blank"
                          rel="noopener"
                          className={estilos.fotoLink}
                          title="Ver a foto inteira"
                        >
                          <img
                            src={foto}
                            alt={altDaFoto(relato.texto, j + 1, fotos.length)}
                            className={estilos.foto}
                            loading="lazy"
                          />
                          <span className={estilos.somenteLeitor}>(abre em nova aba)</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
