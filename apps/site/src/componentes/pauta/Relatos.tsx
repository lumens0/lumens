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
            const foto = relato.foto_chave ? urlFoto(relato.foto_chave) : null;
            return (
              <li key={i} className={[estilos.relato, foto ? estilos.comFoto : ''].join(' ')}>
                {/* Só uma miniatura: a foto inteira abre ao clicar, numa aba nova. */}
                {foto && (
                  <a
                    href={foto}
                    target="_blank"
                    rel="noopener"
                    className={estilos.fotoLink}
                    title="Ver a foto inteira"
                  >
                    <img
                      src={foto}
                      alt={altDaFoto(relato.texto)}
                      className={estilos.foto}
                      loading="lazy"
                    />
                    <span className={estilos.somenteLeitor}>(abre em nova aba)</span>
                  </a>
                )}
                <div className={estilos.relatoCorpo}>
                  <p className={estilos.texto}>{relato.texto}</p>
                  {relato.curso && <p className={estilos.curso}>{relato.curso}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
