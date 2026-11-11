import type { Metadata } from 'next';
import Link from 'next/link';
import { BotaoRelatar } from '../componentes/BotaoWhatsApp';
import componentes from '../componentes/componentes.module.css';
import { MapaResumo } from '../componentes/mapa/MapaResumo';
import { marcadoresDoMapa } from '../componentes/mapa/urgencia';
import { Numero } from '../componentes/Numero';
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
  const marcadores = marcadoresDoMapa(blocos, lista);
  return (
    <main className={estilos.pagina}>
      <section className={[estilos.hero, 'noite'].join(' ')}>
        <div className={estilos.heroTexto}>
          <p className={estilos.sobretitulo}>Campus A. C. Simões, Maceió</p>
          <h1 className={estilos.titulo}>
            O que os estudantes da UFAL estão <em className={estilos.destaque}>pedindo</em>
          </h1>
          <p className={estilos.subtitulo}>
            Cada pauta nasce de um relato no WhatsApp, junta apoios de quem estuda aqui e é cobrada
            até a universidade responder. Tudo fica público, sem login.
          </p>
          <div className={estilos.heroAcoes}>
            {/* Com a lista vazia, o botão aparece na própria ListaVazia. */}
            {lista.length > 0 && <BotaoRelatar />}
            <Link href="/mapa" className={componentes.botaoSecundario}>
              Ver no mapa
            </Link>
          </div>
        </div>
        <Link href="/mapa" className={estilos.heroMapa} aria-label="Abrir o mapa do campus">
          <MapaResumo marcadores={marcadores} />
          <span className={estilos.heroCredito}>Contornos © OpenStreetMap</span>
        </Link>
      </section>

      {/* Os totais acompanham o filtro: o título é o nome do bloco escolhido. */}
      <section className={estilos.totais} aria-labelledby="totais-titulo" aria-live="polite">
        <div className={estilos.totaisTopo}>
          <h2 id="totais-titulo" className={estilos.totaisTitulo}>
            {bloco?.nome ?? 'Todo o campus'}
          </h2>
          <FiltroBloco blocos={blocos} atual={bloco?.slug} />
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
        <ListaVazia bloco={bloco} />
      ) : (
        <ul className={[estilos.lista, estilos.grade].join(' ')}>
          {lista.map((pauta) => (
            <li key={pauta.slug} className="revelar">
              <CardPauta pauta={pauta} />
            </li>
          ))}
        </ul>
      )}
      <footer className={estilos.rodape}>
        <nav aria-label="Mais do Lumens" className={estilos.navegacao}>
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
