import type { Conquista } from '@lumens/contratos';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { formatarNumero } from '../../componentes/BarraApoios';
import componentes from '../../componentes/componentes.module.css';
import { formatarDia } from '../../componentes/pauta/LinhaDoTempo';
import { buscarConquistas } from '../../dados/api';
import { anoEmMaceio, diasEntre, textoDias } from '../../dados/dias';
import { metadadosDaMarca } from '../../metadados';
import estilos from '../page.module.css';

export const metadata: Metadata = metadadosDaMarca({
  caminho: '/conquistas',
  title: 'Conquistas · Lumens',
  description: 'Pautas estudantis da UFAL que viraram conquista.',
});

/** Dias de calendário entre a criação da pauta e a conquista. `null` sem uma das datas. */
const diasAteEntrega = ({ criada_em, conquistada_em }: Conquista) =>
  diasEntre(criada_em, conquistada_em);

/** O ano da conquista, que abre o item como num memorial. Sem data, a da criação da pauta. */
function anoDaConquista({ conquistada_em, criada_em }: Conquista): string {
  const instante = conquistada_em ?? criada_em;
  return instante ? anoEmMaceio(instante) : '';
}

function ItemConquista({ conquista }: { conquista: Conquista }) {
  const id = `conquista-${conquista.pauta_slug}`;
  const dias = diasAteEntrega(conquista);
  return (
    <article className={[componentes.card, estilos.memorial].join(' ')} aria-labelledby={id}>
      <span className={estilos.ano} aria-hidden="true">
        {anoDaConquista(conquista)}
      </span>
      <div className={estilos.memorialCorpo}>
        {conquista.bloco_nome && <span className={componentes.onde}>{conquista.bloco_nome}</span>}
        {conquista.proposta_executada && (
          <span className={componentes.selo}>Solução da comunidade</span>
        )}
        <h2 id={id} className={componentes.titulo}>
          <Link href={`/p/${conquista.pauta_slug}`}>{conquista.titulo}</Link>
        </h2>
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
      </div>
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
      <div className={[estilos.faixa, 'noite'].join(' ')}>
        <p className={estilos.sobretitulo}>Memorial · Campus A. C. Simões</p>
        <h1 className={estilos.titulo}>O que os estudantes já conquistaram</h1>
        <p className={estilos.subtitulo}>
          Cada conquista foi confirmada por quem apoiou. Fica aqui mesmo quando as gestões do DA e
          do DCE mudam.
        </p>
      </div>
      {conquistas.length === 0 ? (
        <div role="status" className={componentes.estado}>
          <p className={componentes.estadoTitulo}>Ainda não tem conquista.</p>
          <p>Quando uma pauta for entregue, ela aparece aqui. Apoie as que estão abertas.</p>
          <div className={componentes.acoes}>
            <Link href="/pautas" className={componentes.botaoSecundario}>
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
