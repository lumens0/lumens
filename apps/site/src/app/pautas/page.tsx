import type { Metadata } from 'next';
import Link from 'next/link';
import { CardPauta } from '../../componentes/CardPauta';
import { FiltroBloco } from '../../componentes/FiltroBloco';
import { FiltroStatus } from '../../componentes/FiltroStatus';
import { ListaVazia } from '../../componentes/ListaVazia';
import { Numero } from '../../componentes/Numero';
import { STATUS } from '../../componentes/StatusPill';
import { buscarBlocos, buscarPautas } from '../../dados/api';
import { blocoDaUrl, pautasPublicas, resumoDosTotais, totais } from '../../dados/pautas-publicas';
import { STATUS_PUBLICOS } from '@lumens/contratos';
import { metadadosDaMarca } from '../../metadados';
import estilos from '../page.module.css';

export const metadata: Metadata = metadadosDaMarca({
  caminho: '/pautas',
  title: 'Pautas · Lumens',
});

/**
 * A lista de pautas, com os filtros de bloco e etapa na URL. O Início (`/`) tem o painel de números;
 * aqui fica o que se lê e se filtra. A busca e a paginação chegam na etapa E4.
 */
export default async function Pautas({
  searchParams,
}: {
  searchParams: Promise<{ bloco?: string | string[]; status?: string | string[] }>;
}) {
  // Erro da API sobe e cai no `error.tsx`. Os totais saem da lista, e não do GET /resumo, porque
  // acompanham o filtro de bloco e o /resumo é sempre do campus inteiro.
  // O `searchParams` vem antes da primeira busca: lê-lo torna a página dinâmica, então o
  // `next build` não tenta pré-renderizar a página chamando a API (que pode nem estar no ar).
  const { bloco: blocoParam, status: statusParam } = await searchParams;
  const blocos = await buscarBlocos();
  const bloco = blocoDaUrl(blocos, blocoParam);
  const status =
    typeof statusParam === 'string'
      ? STATUS_PUBLICOS.find((etapa) => etapa === statusParam)
      : undefined;
  // Uma busca só, sem o filtro de status: a API ordena e o `pautasPublicas` repete a regra como
  // segunda barreira. O status filtra a lista aqui; as contagens do filtro usam as pautas do bloco
  // inteiras, para não mostrar "Sem pautas" em bloco que só não tem aquele status.
  const todas = pautasPublicas(await buscarPautas(bloco?.slug), bloco);
  const lista = status ? todas.filter((pauta) => pauta.status === status) : todas;
  const contagens = Object.fromEntries(
    STATUS_PUBLICOS.map((etapa) => [etapa, todas.filter((pauta) => pauta.status === etapa).length]),
  );
  const contagem = totais(lista);
  const { abertas, apoios, conquistas } = contagem;
  const onde = bloco?.nome ?? 'Todo o campus';
  return (
    <main className={estilos.pagina}>
      <h1 className={estilos.tituloDaLista}>Pautas</h1>

      {/* Os totais acompanham o filtro: o título é o nome do bloco escolhido. A região viva é só o
          resumo escondido: os números visíveis sobem com animação e anunciariam cada quadro. */}
      <section className={estilos.totais} aria-labelledby="totais-titulo">
        <p role="status" className={estilos.somenteLeitor}>
          {resumoDosTotais(onde, contagem)}
        </p>
        <div className={estilos.totaisTopo}>
          <h2 id="totais-titulo" className={estilos.totaisTitulo}>
            {onde}
          </h2>
          <div className={estilos.filtros}>
            <FiltroBloco blocos={blocos} atual={bloco?.slug} status={status} />
            <FiltroStatus atual={status} bloco={bloco?.slug} contagens={contagens} />
          </div>
        </div>
        <dl>
          <div>
            <dt>Pautas abertas</dt>
            <dd>
              <Numero valor={abertas} />
            </dd>
          </div>
          <div>
            <dt>Apoios</dt>
            <dd>
              <Numero valor={apoios} />
            </dd>
          </div>
          <div>
            <dt>Conquistas</dt>
            <dd>
              <Numero valor={conquistas} />
            </dd>
          </div>
        </dl>
      </section>
      {lista.length === 0 ? (
        <ListaVazia bloco={bloco} status={status} />
      ) : (
        <ul className={[estilos.lista, estilos.grade].join(' ')}>
          {lista.map((pauta) => (
            <li key={pauta.slug} className="revelar">
              <CardPauta pauta={pauta} />
            </li>
          ))}
        </ul>
      )}
      <aside className={estilos.legenda} aria-label="Etapas públicas das pautas">
        <h2>Etapas das pautas</h2>
        <ul>
          {STATUS_PUBLICOS.map((etapa) => (
            <li key={etapa}>
              <i style={{ background: STATUS[etapa].ponto }} aria-hidden="true" />
              {STATUS[etapa].rotulo}
            </li>
          ))}
        </ul>
      </aside>
      <footer className={estilos.rodape}>
        <nav aria-label="Mais do Lumens" className={estilos.navegacao}>
          <Link href="/manual">Manual</Link>
          <Link href="/privacidade">Política de privacidade</Link>
          {/* Arquivo, não página: o <a> comum baixa o CSV em vez de navegar. */}
          <a href="/dados.csv" download>
            Dados abertos (CSV)
          </a>
        </nav>
      </footer>
    </main>
  );
}
