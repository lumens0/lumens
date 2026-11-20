import { LIMITE_DA_LISTA, type PautaDaCuradoria, type PendenciaDaCuradoria } from '@lumens/dominio';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { BuscaDaLista } from './busca';
import estilos from '../painel.module.css';
import { alternar, PENDENCIAS, urlDaLista } from './filtros';
import { SeloDePrazo } from './selos';
import { COR_NO_PAINEL, STATUS } from './status';

/** Quantas pautas há em cada situação e em cada pendência, para os números dos chips. */
export interface ContagensDaLista {
  total: number;
  porStatus: Partial<Record<keyof typeof STATUS, number>>;
  porPendencia: Record<PendenciaDaCuradoria, number>;
}

/**
 * Lista de pautas da curadoria: uma busca só (título, bloco ou situação, e "urgente"), e uma linha
 * de chips de seleção múltipla: as situações, um traço e as pendências. "Ou" dentro das situações,
 * "ou" dentro das pendências, "e" entre os dois grupos. Os filtros vão na URL; os chips são links,
 * então funcionam sem JavaScript.
 */
export function ListaDePautas({
  pautas,
  situacoes,
  pendencias,
  q,
  contagens,
}: {
  pautas: PautaDaCuradoria[];
  situacoes: readonly string[];
  pendencias: readonly PendenciaDaCuradoria[];
  q: string;
  contagens?: ContagensDaLista;
}) {
  const aqui = { situacoes, pendencias, q };
  const filtrando = situacoes.length > 0 || pendencias.length > 0 || q.trim() !== '';
  return (
    <>
      <h1>
        Pautas <small className={estilos.total}>{pautas.length}</small>
      </h1>
      {pautas.length >= LIMITE_DA_LISTA && (
        <p className={estilos.aviso} role="status">
          Mostrando as {LIMITE_DA_LISTA} mais antigas. Use os filtros ou a busca para achar as
          outras.
        </p>
      )}
      <div className={estilos.filtros}>
        <BuscaDaLista q={q} situacoes={situacoes} pendencias={pendencias} />
        <ul
          className={[estilos.chips, estilos.rolagem].join(' ')}
          aria-label="Filtrar por etapa e pendência"
        >
          <li>
            <Link
              href={urlDaLista({ ...aqui, situacoes: [], pendencias: [] })}
              className={estilos.chip}
              aria-current={situacoes.length === 0 && pendencias.length === 0 ? 'true' : undefined}
            >
              Todas{contagens ? <b>{contagens.total}</b> : null}
            </Link>
          </li>
          {Object.entries(STATUS)
            .filter(
              ([valor]) =>
                situacoes.includes(valor) ||
                contagens === undefined ||
                (contagens.porStatus[valor as keyof typeof STATUS] ?? 0) > 0,
            )
            .map(([valor, rotulo]) => (
              <li key={valor}>
                <Link
                  href={urlDaLista({ ...aqui, situacoes: alternar(situacoes, valor) })}
                  className={estilos.chip}
                  style={{ '--c': COR_NO_PAINEL[valor as keyof typeof STATUS] } as CSSProperties}
                  aria-current={situacoes.includes(valor) ? 'true' : undefined}
                >
                  <i aria-hidden="true" />
                  {rotulo}
                  {contagens ? (
                    <b>{contagens.porStatus[valor as keyof typeof STATUS] ?? 0}</b>
                  ) : null}
                </Link>
              </li>
            ))}
          <li className={estilos.chipSeparador} aria-hidden="true" />
          {PENDENCIAS.map(({ valor, rotulo }) => (
            <li key={valor}>
              <Link
                href={urlDaLista({ ...aqui, pendencias: alternar(pendencias, valor) })}
                className={estilos.chip}
                aria-current={pendencias.includes(valor) ? 'true' : undefined}
              >
                {rotulo}
                {contagens ? <b>{contagens.porPendencia[valor]}</b> : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {filtrando && (
        <p className={estilos.detalhes}>
          <Link href="/pautas?status=todas">Limpar filtros</Link>
        </p>
      )}

      {pautas.length === 0 ? (
        <p className={estilos.vazio}>Nenhuma pauta com esses filtros.</p>
      ) : (
        <ul className={estilos.lista}>
          {pautas.map((pauta) => {
            const forma = pauta.status === 'recusada' || pauta.status === 'em_curadoria';
            return (
              <li key={pauta.id}>
                <Link
                  href={`/pautas/${pauta.id}`}
                  className={estilos.linha}
                  style={{ '--c': COR_NO_PAINEL[pauta.status] } as CSSProperties}
                >
                  <i
                    className={[
                      estilos.glifo,
                      pauta.status === 'descumprida' ? estilos.glifoVazado : '',
                    ].join(' ')}
                    aria-hidden="true"
                  />
                  <span className={estilos.linhaTitulo}>
                    {pauta.titulo}
                    {pauta.urgente && <em className={estilos.urgente}>Urgente</em>}
                  </span>
                  <span className={estilos.linhaMeta}>
                    {STATUS[pauta.status]} · {pauta.bloco ?? 'Campus inteiro'}
                  </span>
                  <span className={estilos.linhaDireita}>
                    {pauta.status === 'em_curadoria' ? (
                      <SeloDePrazo prazo={pauta.prazo} restanteMs={pauta.restanteMs} />
                    ) : forma ? null : (
                      <>
                        <b>{pauta.apoios}</b> apoios
                      </>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
