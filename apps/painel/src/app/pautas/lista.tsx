import { LIMITE_DA_LISTA, type PautaDaCuradoria, type PendenciaDaCuradoria } from '@lumens/dominio';
import Link from 'next/link';
import { Enviar } from '../enviar';
import estilos from '../painel.module.css';
import { alternar, PENDENCIAS, urlDaLista } from './filtros';
import { SeloDePrazo, SeloDeStatus, SeloUrgente } from './selos';
import { STATUS } from './status';

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
        Pautas <span className={estilos.totalDaLista}>{pautas.length}</span>
      </h1>
      <p className={estilos.apoio}>
        Abra uma pauta para conferir os relatos e acompanhar a resposta oficial.
      </p>
      {pautas.length >= LIMITE_DA_LISTA && (
        <p className={estilos.aviso} role="status">
          Mostrando as {LIMITE_DA_LISTA} mais antigas. Use os filtros ou a busca para achar as
          outras.
        </p>
      )}
      <form action="/pautas" method="get" role="search" className={estilos.buscaDaLista}>
        <label htmlFor="busca-pautas">Buscar por título, bloco ou etapa</label>
        <input
          id="busca-pautas"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Título, bloco, etapa ou “urgente”"
        />
        {situacoes.length > 0 ? (
          <input type="hidden" name="status" value={situacoes.join(',')} />
        ) : (
          <input type="hidden" name="status" value="todas" />
        )}
        {pendencias.length > 0 && (
          <input type="hidden" name="pendencia" value={pendencias.join(',')} />
        )}
        <Enviar className={estilos.botaoSecundario}>Buscar</Enviar>
      </form>

      <ul className={estilos.chipsDaLista} aria-label="Filtrar pautas">
        <li>
          <Link
            href={urlDaLista({ ...aqui, situacoes: [] })}
            className={estilos.chipDaLista}
            aria-current={situacoes.length === 0 ? 'true' : undefined}
          >
            Todas{contagens ? <b>{contagens.total}</b> : null}
          </Link>
        </li>
        {Object.entries(STATUS).map(([valor, rotulo]) => (
          <li key={valor}>
            <Link
              href={urlDaLista({ ...aqui, situacoes: alternar(situacoes, valor) })}
              className={estilos.chipDaLista}
              aria-current={situacoes.includes(valor) ? 'true' : undefined}
            >
              {rotulo}
              {contagens ? <b>{contagens.porStatus[valor as keyof typeof STATUS] ?? 0}</b> : null}
            </Link>
          </li>
        ))}
        <li className={estilos.chipSeparador} aria-hidden="true" />
        {PENDENCIAS.map(({ valor, rotulo }) => (
          <li key={valor}>
            <Link
              href={urlDaLista({ ...aqui, pendencias: alternar(pendencias, valor) })}
              className={estilos.chipDaLista}
              aria-current={pendencias.includes(valor) ? 'true' : undefined}
            >
              {rotulo}
              {contagens ? <b>{contagens.porPendencia[valor]}</b> : null}
            </Link>
          </li>
        ))}
      </ul>
      {filtrando && (
        <p className={estilos.detalhes}>
          <Link href="/pautas?status=todas">Limpar filtros</Link>
        </p>
      )}

      {pautas.length === 0 ? (
        <p className={estilos.aviso}>Nenhuma pauta encontrada.</p>
      ) : (
        <ul className={estilos.lista}>
          {pautas.map((pauta) => (
            <li key={pauta.id} className={[estilos.cartao, estilos.cartaoClicavel].join(' ')}>
              <h2>
                <Link href={`/pautas/${pauta.id}`}>{pauta.titulo}</Link>
              </h2>
              <p className={estilos.selos}>
                <SeloDeStatus status={pauta.status} />
                {pauta.status === 'em_curadoria' && (
                  <SeloDePrazo prazo={pauta.prazo} restanteMs={pauta.restanteMs} />
                )}
                {pauta.urgente && <SeloUrgente />}
              </p>
              <p className={estilos.detalhes}>
                {pauta.bloco ?? 'Campus inteiro'} · {pauta.apoios} de {pauta.meta} apoios
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
