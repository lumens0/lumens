import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApoiosPorSemana } from '../componentes/ApoiosPorSemana';
import { CaminhoDasPautas } from '../componentes/CaminhoDasPautas';
import componentes from '../componentes/componentes.module.css';
import { MapaResumo } from '../componentes/mapa/MapaResumo';
import { marcadoresDoMapa } from '../componentes/mapa/urgencia';
import { Numero } from '../componentes/Numero';
import { PautasPorGrupo } from '../componentes/PautasPorGrupo';
import { buscarApoiosPorSemana, buscarBlocos, buscarPautas } from '../dados/api';
import { apoiosPorCategoria, blocosMaisAtivos } from '../dados/distribuicao';
import { urlAntigaDosFiltros } from '../dados/filtros';
import { pautasPublicas, resumoDosTotais, totais } from '../dados/pautas-publicas';
import { metadadosDaMarca } from '../metadados';
import { nomeDoCanal } from '../whatsapp';
import estilos from './page.module.css';

export const metadata: Metadata = metadadosDaMarca({ caminho: '/' });

/**
 * Início: o painel de números do campus. A lista e os filtros moraram aqui; agora estão em
 * `/pautas`, e o link antigo com `?bloco=` e `?status=` redireciona para lá.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ bloco?: string | string[]; status?: string | string[] }>;
}) {
  // Antes de qualquer busca: link antigo com filtro não gasta chamada à API. Ler o `searchParams`
  // também torna a página dinâmica, então o `next build` não tenta pré-renderizá-la chamando a API.
  const antigo = urlAntigaDosFiltros(await searchParams);
  if (antigo) redirect(antigo);
  // Erro da API sobe e cai no `error.tsx`. Os totais saem da lista, e não do GET /resumo, para o
  // Início e a lista contarem do mesmo jeito.
  const [blocos, pautasDaApi, semanas] = await Promise.all([
    buscarBlocos(),
    buscarPautas(),
    buscarApoiosPorSemana(),
  ]);
  const todas = pautasPublicas(pautasDaApi);
  const contagem = totais(todas);
  const { abertas, apoios, conquistas } = contagem;
  const marcadores = marcadoresDoMapa(blocos, todas);
  return (
    <main className={estilos.pagina}>
      <section className={[estilos.hero, 'noite'].join(' ')}>
        <div className={estilos.heroTexto}>
          <p className={estilos.sobretitulo}>Campus A. C. Simões, Maceió</p>
          <h1 className={estilos.titulo}>
            O que os estudantes da UFAL estão <em className={estilos.destaque}>pedindo</em>
          </h1>
          <p className={estilos.subtitulo}>
            Cada pauta nasce de um relato no {nomeDoCanal()}, junta apoios de quem estuda aqui e é
            cobrada até a universidade responder. Tudo fica público, sem login.
          </p>
          <div className={estilos.heroAcoes}>
            {/* O "Relatar um problema" já está no cabeçalho, em todas as páginas; repetir aqui só
                disputava o olhar com os números. */}
            <Link href="/mapa" className={componentes.botaoSecundario}>
              Ver no mapa
            </Link>
          </div>
        </div>
        {/* O nome do link vem do texto oculto, não de aria-label: as siglas desenhadas no mapa são
            texto visível, e um aria-label sem elas fere a WCAG 2.5.3. O crédito fica fora do link
            pelo mesmo motivo: é atribuição, não o nome do link. */}
        <div className={estilos.heroMapa}>
          <Link href="/mapa" className={estilos.heroMapaLink}>
            <span className={estilos.somenteLeitor}>Abrir o mapa do campus</span>
            <MapaResumo marcadores={marcadores} />
          </Link>
          <span className={estilos.heroCredito}>Contornos © OpenStreetMap</span>
        </div>
      </section>

      {/* A região viva é só o resumo escondido: os números visíveis sobem com animação e
          anunciariam cada quadro. */}
      <section className={estilos.totais} aria-labelledby="totais-titulo">
        <p role="status" className={estilos.somenteLeitor}>
          {resumoDosTotais('Todo o campus', contagem)}
        </p>
        <div className={estilos.totaisTopo}>
          <h2 id="totais-titulo" className={estilos.totaisTitulo}>
            Todo o campus
          </h2>
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
      {todas.length > 0 && (
        <div className={estilos.dashboard}>
          <CaminhoDasPautas pautas={todas} />
          <ApoiosPorSemana semanas={semanas} />
          <PautasPorGrupo
            id="categorias-titulo"
            titulo="Apoios por categoria"
            vazio="Nenhum apoio por categoria ainda."
            grupos={apoiosPorCategoria(todas)}
          />
          <PautasPorGrupo
            id="blocos-titulo"
            titulo="Blocos mais ativos"
            vazio="Nenhum apoio por bloco ainda."
            grupos={blocosMaisAtivos(todas)}
          />
        </div>
      )}
      <p className={estilos.verPautas}>
        <Link href="/pautas" className={componentes.botaoSecundario}>
          {todas.length === 1 ? 'Ver a pauta' : `Ver as ${String(todas.length)} pautas`}
        </Link>
      </p>
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
