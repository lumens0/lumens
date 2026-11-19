import type { Metadata } from 'next';
import Link from 'next/link';
import { ApoiosPorSemana } from '../componentes/ApoiosPorSemana';
import componentes from '../componentes/componentes.module.css';
import {
  BlocosFiltraveis,
  EtapasFiltraveis,
  type LinhaDeBloco,
} from '../componentes/inicio/FiltrosDoInicio';
import estilosDoInicio from '../componentes/inicio/inicio.module.css';
import {
  AcaoDoInicio,
  NumerosDoCampus,
  PertoDaMetaSecao,
  type EtiquetaDeFiltro,
} from '../componentes/inicio/Secoes';
import { Skyline } from '../componentes/inicio/Skyline';
import { STATUS } from '../componentes/StatusPill';
import { buscarApoiosPorSemana, buscarBlocos, buscarConquistas, buscarPautas } from '../dados/api';
import { caminhoDasPautas } from '../dados/caminho';
import { blocosMaisAtivos } from '../dados/distribuicao';
import {
  blocosDaUrl,
  filtrarPautas,
  statusDaUrl,
  urlDeFiltros,
  type ParamDaUrl,
} from '../dados/filtros';
import { numerosDoInicio, pertoDaMeta } from '../dados/inicio';
import { pautasPublicas, resumoDosTotais, totais } from '../dados/pautas-publicas';
import { legendaDoSkyline, montarSkyline } from '../dados/skyline';
import { metadadosDaMarca } from '../metadados';
import { nomeDoCanal } from '../whatsapp';
import estilos from './page.module.css';

export const metadata: Metadata = metadadosDaMarca({ caminho: '/' });

/**
 * Início: o painel de números do campus. Etapas e blocos são filtros de seleção múltipla na URL
 * (`?status=a,b&bloco=c,d`): "ou" dentro de cada grupo, "e" entre os grupos. A lista fica em
 * `/pautas` e recebe os mesmos filtros.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ bloco?: ParamDaUrl; status?: ParamDaUrl }>;
}) {
  // Erro da API sobe e cai no `error.tsx`. O `searchParams` vem antes da primeira busca: lê-lo
  // torna a página dinâmica, então o `next build` não tenta pré-renderizá-la chamando a API.
  const { bloco: blocoParam, status: statusParam } = await searchParams;
  const [blocos, pautasDaApi, semanas, conquistas] = await Promise.all([
    buscarBlocos(),
    buscarPautas(),
    buscarApoiosPorSemana(),
    buscarConquistas(),
  ]);
  const status = statusDaUrl(statusParam);
  const escolhidos = blocosDaUrl(blocos, blocoParam);
  const slugs = escolhidos.map((b) => b.slug);

  const campus = pautasPublicas(pautasDaApi);
  // Os recortes: o dos blocos (para contar as etapas), o das etapas (para os blocos) e o dos dois
  // (para os números, o "perto da meta" e o botão da lista).
  const doBloco = filtrarPautas(campus, { status: [], blocos: escolhidos });
  const daEtapa = filtrarPautas(campus, { status, blocos: [] });
  const recorte = filtrarPautas(campus, { status, blocos: escolhidos });

  const nomesEscolhidos = new Set(escolhidos.map((b) => b.nome));
  const numeros = numerosDoInicio({
    pautas: recorte,
    campus,
    semanas,
    conquistas:
      escolhidos.length === 0
        ? conquistas
        : conquistas.filter((c) => c.bloco_nome !== null && nomesEscolhidos.has(c.bloco_nome)),
    recortePorBloco: escolhidos.length > 0,
  });
  const onde =
    escolhidos.length === 0
      ? 'Todo o campus'
      : escolhidos.length === 1
        ? (escolhidos[0]?.nome ?? '')
        : `${String(escolhidos.length)} blocos`;

  const etapas = caminhoDasPautas(doBloco)
    .filter((e) => e.total > 0 || status.some((s) => s === e.status))
    .map((e) => ({ status: e.status, total: e.total, largura: e.largura }));
  const maisAtivos = blocosMaisAtivos(daEtapa);
  const linhasDeBloco: LinhaDeBloco[] = [
    ...maisAtivos.map((g) => ({
      slug: g.chave,
      nome: g.rotulo,
      apoios: g.total,
      largura: g.largura,
    })),
    // Bloco escolhido que ficou fora dos mais ativos continua na lista, para dar para tirá-lo.
    ...escolhidos
      .filter((b) => !maisAtivos.some((g) => g.chave === b.slug))
      .map((b) => ({ slug: b.slug, nome: b.nome, apoios: 0, largura: 0 })),
  ];

  const predios = montarSkyline({ blocos, pautas: campus, escolhidos: slugs, status });
  const legenda = legendaDoSkyline(
    escolhidos.map((b) => ({
      nome: b.nome,
      pautas: recorte.filter((p) => p.bloco_slug === b.slug).length,
    })),
  );

  const etiquetas: EtiquetaDeFiltro[] = [
    ...status.map((etapa) => ({
      texto: STATUS[etapa].rotulo,
      rotulo: `Tirar o filtro de etapa ${STATUS[etapa].rotulo}`,
      href: urlDeFiltros('/', { status: status.filter((s) => s !== etapa), bloco: slugs }),
    })),
    ...escolhidos.map((b) => ({
      texto: b.nome,
      rotulo: `Tirar o filtro de bloco ${b.nome}`,
      href: urlDeFiltros('/', { status, bloco: slugs.filter((s) => s !== b.slug) }),
    })),
  ];

  return (
    <main className={estilos.pagina}>
      <section className={[estilos.hero, estilosDoInicio.ceu, 'noite'].join(' ')}>
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
            <Link
              href="/mapa"
              className={[componentes.botaoSecundario, estilos.soDesktop].join(' ')}
            >
              Ver no mapa
            </Link>
          </div>
        </div>
        <Skyline predios={predios} legenda={legenda} />
      </section>

      {/* A região viva é só o resumo escondido: os números visíveis sobem com animação e
          anunciariam cada quadro. */}
      <section className={estilosDoInicio.secaoNumeros} aria-labelledby="totais-titulo">
        <p role="status" className={estilos.somenteLeitor}>
          {resumoDosTotais(onde, totais(recorte))}
        </p>
        <div className={estilos.totaisTopo}>
          <h2 id="totais-titulo" className={estilos.totaisTitulo}>
            O campus em números
          </h2>
          <p className={estilos.subtituloDosNumeros}>{onde}</p>
        </div>
        <NumerosDoCampus numeros={numeros} />
      </section>

      <div className={estilosDoInicio.colunas}>
        <ApoiosPorSemana semanas={semanas} />
        <section aria-labelledby="etapas-titulo">
          <h2 id="etapas-titulo">Em que etapa estão</h2>
          <EtapasFiltraveis linhas={etapas} atual={{ status, bloco: slugs }} />
        </section>
        <section aria-labelledby="blocos-titulo">
          <h2 id="blocos-titulo">Blocos mais ativos</h2>
          <BlocosFiltraveis linhas={linhasDeBloco} atual={{ status, bloco: slugs }} />
        </section>
      </div>

      <PertoDaMetaSecao pautas={pertoDaMeta(recorte)} />

      <AcaoDoInicio etiquetas={etiquetas} total={recorte.length} status={status} bloco={slugs} />

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
