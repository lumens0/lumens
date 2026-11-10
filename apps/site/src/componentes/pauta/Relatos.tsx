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
              <li key={i} className={estilos.relato}>
                {foto && <img src={foto} alt={altDaFoto(relato.texto)} className={estilos.foto} />}
                <p className={estilos.texto}>{relato.texto}</p>
                {relato.curso && <p className={estilos.curso}>{relato.curso}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
