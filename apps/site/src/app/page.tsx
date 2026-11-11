import type { Metadata } from 'next';
import Link from 'next/link';
import { formatarNumero } from '../componentes/BarraApoios';
import { BotaoRelatar } from '../componentes/BotaoWhatsApp';
import { CardPauta } from '../componentes/CardPauta';
import { FiltroBloco } from '../componentes/FiltroBloco';
import { ListaVazia } from '../componentes/ListaVazia';
import { buscarBlocos, buscarPautas } from '../dados/api';
import { blocoDaUrl, pautasPublicas, totais } from '../dados/pautas-publicas';
import estilos from './page.module.css';
import { metadadosDaMarca } from '../metadados';

export const metadata: Metadata = metadadosDaMarca({ caminho: '/' });

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ bloco?: string | string[] }>;
}) {
  // Erro da API sobe e cai no `error.tsx`. Os totais saem da lista, e não do GET /resumo, porque
  // acompanham o filtro de bloco e o /resumo é sempre do campus inteiro.
  // O `searchParams` vem antes da primeira busca: lê-lo torna a página dinâmica, então o
  // `next build` não tenta pré-renderizar a home chamando a API (que pode nem estar no ar).
  const { bloco: blocoParam } = await searchParams;
  const blocos = await buscarBlocos();
  const bloco = blocoDaUrl(blocos, blocoParam);
  // A API já filtra e ordena; o `pautasPublicas` repete a regra como segunda barreira.
  const lista = pautasPublicas(await buscarPautas(bloco?.slug), bloco);
  const { abertas, apoios, conquistas } = totais(lista);
  return (
    <main className={estilos.pagina}>
      <h1 className={estilos.titulo}>Lumens</h1>
      <p className={estilos.subtitulo}>Da reclamação à pauta.</p>
      {/* Com a lista vazia, o botão aparece na própria ListaVazia. */}
      {lista.length > 0 && <BotaoRelatar />}
      <FiltroBloco blocos={blocos} atual={bloco?.slug} />
      {/* Os totais acompanham o filtro: o título é o nome do bloco escolhido. */}
      <section className={estilos.totais} aria-labelledby="totais-titulo" aria-live="polite">
        <h2 id="totais-titulo" className={estilos.totaisTitulo}>
          {bloco?.nome ?? 'Todo o campus'}
        </h2>
        <dl>
          <div>
            <dt>Pautas abertas</dt>
            <dd>{formatarNumero(abertas)}</dd>
          </div>
          <div>
            <dt>Apoios</dt>
            <dd>{formatarNumero(apoios)}</dd>
          </div>
          <div>
            <dt>Conquistas</dt>
            <dd>{formatarNumero(conquistas)}</dd>
          </div>
        </dl>
      </section>
      {lista.length === 0 ? (
        <ListaVazia bloco={bloco} />
      ) : (
        <ul className={estilos.lista}>
          {lista.map((pauta) => (
            <li key={pauta.slug}>
              <CardPauta pauta={pauta} />
            </li>
          ))}
        </ul>
      )}
      <footer className={estilos.rodape}>
        <nav aria-label="Mais do Lumens" className={estilos.navegacao}>
          <Link href="/conquistas">Conquistas</Link>
          <Link href="/atividade">Atividade</Link>
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
