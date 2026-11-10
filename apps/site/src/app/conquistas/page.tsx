import type { Conquista } from '@lumens/contratos';
import type { Metadata } from 'next';
import Link from 'next/link';
import { formatarNumero } from '../../componentes/BarraApoios';
import componentes from '../../componentes/componentes.module.css';
import { formatarDia } from '../../componentes/pauta/LinhaDoTempo';
import { buscarConquistas } from '../../dados/api';
import estilos from '../page.module.css';

export const metadata: Metadata = { title: 'Conquistas · Lumens' };

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/** Dias corridos entre a criação da pauta e a conquista. `null` sem a data da conquista. */
function diasAteEntrega({ criada_em, conquistada_em }: Conquista): number | null {
  if (!conquistada_em) return null;
  return Math.floor((Date.parse(conquistada_em) - Date.parse(criada_em)) / DIA_EM_MS);
}

function ItemConquista({ conquista }: { conquista: Conquista }) {
  const id = `conquista-${conquista.pauta_slug}`;
  const dias = diasAteEntrega(conquista);
  return (
    <article className={componentes.card} aria-labelledby={id}>
      {conquista.bloco_nome && <span className={componentes.contexto}>{conquista.bloco_nome}</span>}
      <h2 id={id} className={componentes.titulo}>
        <Link href={`/p/${conquista.pauta_slug}`}>{conquista.titulo}</Link>
      </h2>
      {conquista.proposta_executada && (
        <span className={componentes.selo}>Solução da comunidade</span>
      )}
      <dl className={estilos.fatos}>
        {conquista.conquistada_em && (
          <div>
            <dt>Conquistada em</dt>
            <dd>
              <time dateTime={conquista.conquistada_em}>
                {formatarDia(conquista.conquistada_em)}
              </time>
            </dd>
          </div>
        )}
        <div>
          <dt>Apoios</dt>
          <dd>{formatarNumero(conquista.apoios)}</dd>
        </div>
        {dias !== null && (
          <div>
            <dt>Da criação à entrega</dt>
            <dd>{dias === 1 ? '1 dia' : `${formatarNumero(dias)} dias`}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}

export default async function PaginaConquistas() {
  // Erro da API sobe e cai no `error.tsx`.
  const conquistas = await buscarConquistas();
  return (
    <main className={estilos.pagina}>
      <p>
        <Link href="/">← Todas as pautas</Link>
      </p>
      <h1 className={estilos.titulo}>Conquistas</h1>
      <p className={estilos.subtitulo}>Pautas que o campus cobrou e conseguiu.</p>
      {conquistas.length === 0 ? (
        <div role="status" className={componentes.estado}>
          <p className={componentes.estadoTitulo}>Ainda não tem conquista.</p>
          <p>Quando uma pauta for entregue, ela aparece aqui. Apoie as que estão abertas.</p>
          <div className={componentes.acoes}>
            <Link href="/" className={componentes.botaoSecundario}>
              Ver as pautas
            </Link>
          </div>
        </div>
      ) : (
        <ul className={estilos.lista}>
          {conquistas.map((conquista) => (
            <li key={conquista.pauta_slug}>
              <ItemConquista conquista={conquista} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
