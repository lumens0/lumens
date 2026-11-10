import type { Conquista } from '@lumens/contratos';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { formatarNumero } from '../../componentes/BarraApoios';
import componentes from '../../componentes/componentes.module.css';
import { formatarDia } from '../../componentes/pauta/LinhaDoTempo';
import { buscarConquistas } from '../../dados/api';
import estilos from '../page.module.css';

export const metadata: Metadata = { title: 'Conquistas · Lumens' };

const DIA_EM_MS = 24 * 60 * 60 * 1000;

// `en-CA` formata como AAAA-MM-DD, que o `Date.parse` lê como meia-noite UTC daquele dia.
const diaEmMaceio = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio' });
const diaDoCalendario = (instante: string) =>
  Date.parse(diaEmMaceio.format(new Date(instante))) / DIA_EM_MS;

/**
 * Dias de calendário (em Maceió) entre a criação da pauta e a conquista, para bater com as datas
 * mostradas. `null` sem uma das datas: API antiga sem `criada_em` não vira "NaN dias".
 */
function diasAteEntrega({ criada_em, conquistada_em }: Conquista): number | null {
  if (!conquistada_em || !criada_em) return null;
  const dias = Math.round(diaDoCalendario(conquistada_em) - diaDoCalendario(criada_em));
  return Number.isFinite(dias) ? dias : null;
}

function textoDias(dias: number): string {
  if (dias === 0) return 'No mesmo dia';
  return dias === 1 ? '1 dia' : `${formatarNumero(dias)} dias`;
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
            <dd>{textoDias(dias)}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}

export default async function PaginaConquistas() {
  // Sem parâmetro na URL, o `next build` pré-renderizaria a página chamando a API (que pode nem
  // estar no ar). O `connection()` deixa a renderização para a hora do acesso.
  await connection();
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
