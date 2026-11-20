import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { rotuloDaCategoria, STATUS_PUBLICOS, type StatusPublico } from '@lumens/contratos';
import componentes from '../componentes/componentes.module.css';
import { ApoiosPorSemana } from '../componentes/ApoiosPorSemana';
import { BarraApoios, formatarNumero } from '../componentes/BarraApoios';
import { BotaoRelatar } from '../componentes/BotaoWhatsApp';
import { CaminhoDasPautas } from '../componentes/CaminhoDasPautas';
import { Hud, type ItemDoHud } from '../componentes/Hud';
import { Icone, ICONE_DA_ETAPA } from '../componentes/Icone';
import { ListaVazia } from '../componentes/ListaVazia';
import { Numero } from '../componentes/Numero';
import { PautasPorGrupo } from '../componentes/PautasPorGrupo';
import { STATUS } from '../componentes/StatusPill';
import { CampusNoturno } from '../componentes/home/CampusNoturno';
import { Cinema } from '../componentes/home/Cinema';
import { ListaDePautas } from '../componentes/home/ListaDePautas';
import estilos from '../componentes/home/home.module.css';
import { FolhaDeBlocos } from '../componentes/inicio/FolhaDeBlocos';
import { PREDIOS } from '../componentes/mapa/predios';
import { maisUrgente, marcadoresDoMapa } from '../componentes/mapa/urgencia';
import { buscarApoiosPorSemana, buscarBlocos, buscarPautas } from '../dados/api';
import { apoiosPorCategoria, blocosMaisAtivos } from '../dados/distribuicao';
import {
  alternar,
  blocosDaUrl,
  filtrarPautas,
  statusDaUrl,
  urlDeFiltros,
  type ParamDaUrl,
} from '../dados/filtros';
import { blocosDaFolha } from '../dados/folha';
import { pautasPublicas, resumoDosTotais, totais } from '../dados/pautas-publicas';
import { siglasDosBlocos } from '../dados/siglas';
import type { Pauta } from '../dados/tipos';
import { metadadosDaMarca } from '../metadados';
import { nomeDoCanal } from '../whatsapp';

export const metadata: Metadata = metadadosDaMarca({ caminho: '/' });

const diaEMes = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Maceio',
});
const data = (instante: string | null) =>
  instante ? diaEMes.format(new Date(instante)) : undefined;
const predioDoBloco = (slug: string | null) =>
  slug ? PREDIOS.find((p) => p.blocos.includes(slug))?.id : undefined;

/** O caminho de uma pauta, do apoio à promessa; entregue em parte e descumprida vêm depois dele. */
const CAMINHO: readonly StatusPublico[] = [
  'juntando_apoios',
  'meta_batida',
  'cobrando',
  'prometido',
];

const HUD: readonly ItemDoHud[] = [
  { id: 'abertura', rotulo: 'Início', icone: 'mapa' },
  { id: 'como-funciona', rotulo: 'Como funciona', icone: 'conversa' },
  { id: 'em-destaque', rotulo: 'Pauta em destaque', icone: 'megafone' },
  { id: 'pautas', rotulo: 'Todas as pautas', icone: 'grade' },
  { id: 'numeros', rotulo: 'Apoios e números', icone: 'grafico' },
  { id: 'relatar', rotulo: 'Relatar um problema', icone: 'lampada' },
];

/** Uma palavra por `<span>`: as do manifesto acendem na ordem da leitura. */
function Palavras({ texto, luz = false }: { texto: string; luz?: boolean }) {
  return texto.split(/(\s+)/).map((pedaco, i) =>
    pedaco.trim() ? (
      <span key={i} data-palavra="" className={luz ? estilos.palavraLuz : estilos.palavra}>
        {pedaco}
      </span>
    ) : (
      pedaco
    ),
  );
}

/** Filtro por etapa em links: funciona sem JavaScript e a URL guarda a escolha (única ou múltipla). */
function FiltroEtapas({
  atual,
  blocos,
  contagens,
  total,
}: {
  atual: readonly StatusPublico[];
  blocos: readonly string[];
  contagens: Record<string, number>;
  total: number;
}) {
  return (
    <nav className={estilos.filtros} aria-label="Filtrar por etapa" data-rola="">
      <Link
        href={urlDeFiltros('/', { status: [], bloco: blocos })}
        scroll={false}
        className={estilos.filtro}
        aria-current={atual.length === 0 ? 'true' : undefined}
      >
        Todas<small>{total}</small>
      </Link>
      {STATUS_PUBLICOS.filter((etapa) => (contagens[etapa] ?? 0) > 0 || atual.includes(etapa)).map(
        (etapa) => {
          const ativa = atual.includes(etapa);
          return (
            <Link
              key={etapa}
              href={urlDeFiltros('/', { status: alternar(atual, etapa), bloco: blocos })}
              scroll={false}
              className={estilos.filtro}
              aria-current={ativa ? 'true' : undefined}
            >
              <Icone nome={ICONE_DA_ETAPA[etapa]} />
              {STATUS[etapa].rotulo}
              <small>{contagens[etapa] ?? 0}</small>
            </Link>
          );
        },
      )}
    </nav>
  );
}

function Cartao({ pauta }: { pauta: Pauta & { status: StatusPublico } }) {
  const etapa = STATUS[pauta.status];
  const categoria = rotuloDaCategoria(pauta.categoria);
  return (
    <article className={estilos.cartao} style={{ '--c': etapa.ponto } as CSSProperties}>
      <span className={estilos.etapa}>
        <Icone nome={ICONE_DA_ETAPA[pauta.status]} />
        {etapa.rotulo}
        {pauta.urgente && <b className={estilos.urgente}>urgente</b>}
      </span>
      <h3>
        <Link href={`/p/${pauta.slug}`}>{pauta.titulo}</Link>
      </h3>
      <p className={estilos.onde}>
        <span>
          <Icone nome="local" />
          {pauta.bloco_nome ?? 'Todo o campus'}
        </span>
        {categoria && (
          <span>
            <Icone nome="etiqueta" />
            {categoria}
          </span>
        )}
      </p>
      <p className={estilos.descricao}>{pauta.descricao}</p>
      <p className={estilos.apoios}>
        <strong>{formatarNumero(pauta.apoios)}</strong> de {formatarNumero(pauta.meta)} apoios
      </p>
      <BarraApoios
        apoios={pauta.apoios}
        meta={pauta.meta}
        rotulo={`Apoios de ${pauta.titulo}`}
        cor={etapa.ponto}
        semLegenda
      />
      <p className={estilos.aberta}>aberta em {data(pauta.criada_em)}</p>
    </article>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ bloco?: ParamDaUrl; status?: ParamDaUrl }>;
}) {
  // Erro da API sobe e cai no `error.tsx`. O `searchParams` vem antes da primeira busca: lê-lo
  // torna a página dinâmica, então o `next build` não tenta pré-renderizá-la chamando a API.
  const { bloco: blocoParam, status: statusParam } = await searchParams;
  // Uma busca só do campus inteiro: os filtros de bloco e etapa são de seleção múltipla na URL
  // (`?status=a,b&bloco=c,d`) e também alimentam a folha "Escolher blocos" sem chamadas extras.
  const [blocos, pautasDaApi, semanas] = await Promise.all([
    buscarBlocos(),
    buscarPautas(),
    buscarApoiosPorSemana(),
  ]);
  const escolhidos = blocosDaUrl(blocos, blocoParam);
  const slugs = escolhidos.map((b) => b.slug);
  const status = statusDaUrl(statusParam);
  const campus = pautasPublicas(pautasDaApi) as (Pauta & { status: StatusPublico })[];
  const doBloco = filtrarPautas(campus, { status: [], blocos: escolhidos });
  const lista = filtrarPautas(campus, { status, blocos: escolhidos });
  const contagens = Object.fromEntries(
    STATUS_PUBLICOS.map((etapa) => [
      etapa,
      doBloco.filter((pauta) => pauta.status === etapa).length,
    ]),
  );
  const contagem = totais(lista);
  const { abertas, apoios, conquistas } = contagem;
  const onde =
    escolhidos.length === 0
      ? 'Todo o campus'
      : escolhidos.length === 1
        ? (escolhidos[0]?.nome ?? 'Todo o campus')
        : `${String(escolhidos.length)} blocos`;
  const marcadores = marcadoresDoMapa(blocos, doBloco);
  const destaque = maisUrgente(doBloco);
  const siglas = siglasDosBlocos(blocos);
  const canal = nomeDoCanal();

  // A pauta em destaque: as etapas do caminho dela, com data onde a API dá a data.
  const etapasDoDestaque = destaque
    ? CAMINHO.includes(destaque.status)
      ? CAMINHO
      : [...CAMINHO, destaque.status]
    : [];
  const atualDoDestaque = destaque ? etapasDoDestaque.indexOf(destaque.status) : -1;
  const tetoDoDestaque = destaque ? Math.max(destaque.apoios, destaque.meta) * 1.15 : 1;

  const pinos = marcadores.flatMap((m) => {
    const predio = PREDIOS.find((p) => p.id === m.predio);
    if (!predio) return [];
    const etapa: StatusPublico = maisUrgente(m.pautas)?.status ?? 'conquistada';
    return [
      <div key={m.slug} className={estilos.pino} data-pino={predio.id}>
        <div>
          <Icone nome={ICONE_DA_ETAPA[etapa]} />
          <b>{predio.sigla}</b>
          <small>{STATUS[etapa].rotulo}</small>
        </div>
        <i />
      </div>,
    ];
  });
  const rotuloEtapas =
    status.length === 0
      ? ''
      : ` em ${status.map((etapa) => STATUS[etapa].rotulo.toLowerCase()).join(' e ')}`;
  const resumoDaLista = `${String(lista.length)} ${lista.length === 1 ? 'pauta pública' : 'pautas públicas'}${rotuloEtapas} · ${onde}`;
  const linkParaLista = urlDeFiltros('/pautas', { status, bloco: slugs });
  const blocoParaVazio =
    escolhidos.length === 1
      ? escolhidos[0]
      : escolhidos.length > 1
        ? { slug: slugs.join(','), nome: onde, base_estudantes: 0 }
        : undefined;

  return (
    <main className={estilos.home}>
      <Hud
        itens={destaque ? HUD : HUD.filter((h) => h.id !== 'em-destaque')}
        rotulo="Partes da página"
      />
      <Cinema
        key={`${slugs.join(',')}-${status.join(',')}`}
        mapa={<CampusNoturno marcadores={marcadores} />}
        pinos={pinos}
        foco={escolhidos.length === 1 ? predioDoBloco(escolhidos[0]?.slug ?? null) : undefined}
      >
        <section
          id="abertura"
          data-cena="abertura"
          className={estilos.cena}
          aria-labelledby="titulo-home"
        >
          <div className={estilos.palco}>
            <p className={estilos.lugar}>Campus A. C. Simões, Maceió</p>
            <h1 id="titulo-home" className={estilos.titulo}>
              <span data-linha="">O que os estudantes</span>{' '}
              <span data-linha="">da UFAL estão</span>{' '}
              <span data-linha="" className={estilos.luz}>
                pedindo
              </span>
            </h1>
            {/* Os totais acompanham o filtro: o título é o bloco ou recorte escolhido. A região viva é
                só o resumo escondido: os números visíveis sobem com animação e anunciariam cada quadro. */}
            <section className={estilos.totais} aria-labelledby="totais-titulo" data-contadores="">
              <p role="status" className={estilos.somenteLeitor}>
                {resumoDosTotais(onde, contagem)}
              </p>
              <div className={estilos.totaisTopo}>
                <h2 id="totais-titulo">{onde}</h2>
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
              <div className={estilos.totaisFiltro}>
                <FolhaDeBlocos
                  base="/"
                  blocos={blocosDaFolha(blocos, siglas, campus, status)}
                  catalogo={blocos}
                  siglas={siglas}
                  pautas={campus.map((p) => ({
                    slug: p.slug,
                    titulo: p.titulo,
                    status: p.status,
                    apoios: p.apoios,
                    urgente: p.urgente,
                    bloco_slug: p.bloco_slug,
                  }))}
                  atual={{ status, bloco: slugs }}
                />
                {escolhidos.map((b) => (
                  <Link
                    key={b.slug}
                    href={urlDeFiltros('/', {
                      status,
                      bloco: slugs.filter((s) => s !== b.slug),
                    })}
                    scroll={false}
                    className={estilos.filtroAtivo}
                    aria-label={`Tirar o filtro de bloco ${b.nome}`}
                  >
                    {b.nome}
                    <span aria-hidden="true">×</span>
                  </Link>
                ))}
                {status.map((etapa) => (
                  <Link
                    key={etapa}
                    href={urlDeFiltros('/', {
                      status: status.filter((s) => s !== etapa),
                      bloco: slugs,
                    })}
                    scroll={false}
                    className={estilos.filtroAtivo}
                    aria-label={`Tirar o filtro de etapa ${STATUS[etapa].rotulo}`}
                  >
                    {STATUS[etapa].rotulo}
                    <span aria-hidden="true">×</span>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </section>

        <section
          id="como-funciona"
          data-cena="manifesto"
          className={estilos.cena}
          aria-label="Como funciona"
        >
          <div className={estilos.palco}>
            <p className={estilos.manifesto}>
              <Palavras texto="Toda pauta começa com um" />{' '}
              <span data-palavra="" className={estilos.chip}>
                <Icone nome="conversa" />
                relato no {canal}
              </span>{' '}
              <Palavras texto="de quem estuda aqui. A" /> <Palavras texto="curadoria" luz />{' '}
              <Palavras texto="confere, e a pauta entra no mapa" /> <Palavras texto="acesa." luz />{' '}
              <Palavras texto="Cada" />{' '}
              <span data-palavra="" className={estilos.chip}>
                <Icone nome="apoio" />
                apoio
              </span>{' '}
              <Palavras texto="pelo bot deixa a luz mais forte, até a universidade" />{' '}
              <Palavras texto="responder." luz /> <Palavras texto="Tudo fica público, sem login." />
            </p>
          </div>
        </section>

        {destaque && (
          <section
            id="em-destaque"
            data-cena="destaque"
            data-alvo={predioDoBloco(destaque.bloco_slug)}
            className={estilos.cena}
            aria-labelledby="destaque-titulo"
          >
            <div className={[estilos.palco, estilos.palcoDestaque].join(' ')}>
              <div className={estilos.numero} data-numero="">
                <p className={estilos.numeroGrande}>
                  <span aria-hidden="true" data-apoios-animado="" data-valor={destaque.apoios}>
                    {formatarNumero(destaque.apoios)}
                  </span>
                  <span className={estilos.somenteLeitor}>
                    {formatarNumero(destaque.apoios)} de {formatarNumero(destaque.meta)} apoios
                  </span>
                </p>
                <p className={estilos.numeroLegenda} aria-hidden="true">
                  apoios de quem estuda {destaque.bloco_nome ? 'no bloco' : 'no campus'}
                </p>
              </div>
              <div
                className={estilos.medidor}
                data-medidor=""
                data-teto={tetoDoDestaque}
                aria-hidden="true"
                style={
                  {
                    '--m': String((destaque.apoios / tetoDoDestaque) * 100),
                    '--c': STATUS[destaque.status].ponto,
                    '--meta': `${String((destaque.meta / tetoDoDestaque) * 100)}%`,
                  } as CSSProperties
                }
              >
                <span />
                <i>
                  <small>meta · {formatarNumero(destaque.meta)}</small>
                </i>
              </div>
              <div className={estilos.ficha} data-ficha="">
                <p className={estilos.sobre} id="destaque-titulo">
                  Mais urgente agora
                </p>
                <p className={estilos.onde}>
                  <span>
                    <Icone nome="local" />
                    {destaque.bloco_nome ?? 'Todo o campus'}
                  </span>
                  {rotuloDaCategoria(destaque.categoria) && (
                    <span>
                      <Icone nome="etiqueta" />
                      {rotuloDaCategoria(destaque.categoria)}
                    </span>
                  )}
                  <span>
                    <Icone nome="calendario" />
                    aberta em {data(destaque.criada_em)}
                  </span>
                </p>
                <h2>{destaque.titulo}</h2>
                <ol className={estilos.passos}>
                  {etapasDoDestaque.map((etapa, k) => {
                    const quando =
                      etapa === 'juntando_apoios'
                        ? data(destaque.aprovada_em)
                        : etapa === 'meta_batida'
                          ? data(destaque.meta_batida_em)
                          : undefined;
                    return (
                      <li
                        key={etapa}
                        data-passo=""
                        data-feito={k <= atualDoDestaque ? '' : undefined}
                        data-cor={STATUS[etapa].ponto}
                        style={{ '--c': STATUS[etapa].ponto } as CSSProperties}
                      >
                        <span>
                          <Icone nome={ICONE_DA_ETAPA[etapa]} />
                        </span>
                        {STATUS[etapa].rotulo}
                        {quando && <small>{quando}</small>}
                      </li>
                    );
                  })}
                </ol>
                {destaque.proxima_etapa && (
                  <p className={estilos.proximaEtapa} data-proxima-etapa="">
                    <Icone nome="calendario" />
                    {destaque.proxima_etapa}
                  </p>
                )}
                <Link href={`/p/${destaque.slug}`} className={estilos.abrirPauta}>
                  Abrir a pauta
                  <Icone nome="abrir" />
                </Link>
              </div>
            </div>
          </section>
        )}

        <section
          id="pautas"
          data-cena="pautas"
          className={estilos.cena}
          aria-labelledby="pautas-titulo"
          style={{ '--n': String(Math.max(1, lista.length)) } as CSSProperties}
        >
          <div className={[estilos.palco, estilos.palcoPautas].join(' ')}>
            <div className={estilos.topoPautas}>
              <div>
                <h2 id="pautas-titulo">Todas as pautas</h2>
                <p className={estilos.sub}>{resumoDaLista}</p>
              </div>
              <FiltroEtapas
                atual={status}
                blocos={slugs}
                contagens={contagens}
                total={doBloco.length}
              />
            </div>
            {lista.length === 0 ? (
              <div className={estilos.vazio}>
                <ListaVazia
                  bloco={blocoParaVazio}
                  status={status.length === 1 ? status[0] : undefined}
                />
              </div>
            ) : (
              <>
                <ul className={estilos.carrossel} data-carrossel="">
                  {lista.map((pauta) => (
                    <li
                      key={pauta.slug}
                      data-cartao=""
                      data-predio={predioDoBloco(pauta.bloco_slug)}
                      data-etapa={pauta.status}
                    >
                      <Cartao pauta={pauta} />
                    </li>
                  ))}
                </ul>
                <div className={estilos.navegacao} data-navegacao="">
                  <button type="button" data-anterior="" aria-label="Pauta anterior">
                    <Icone nome="anterior" />
                  </button>
                  <span data-posicao="" aria-hidden="true">
                    01 / {String(lista.length).padStart(2, '0')}
                  </span>
                  <button type="button" data-proxima="" aria-label="Próxima pauta">
                    <Icone nome="proxima" />
                  </button>
                  <ListaDePautas resumo={resumoDaLista}>
                    <FiltroEtapas
                      atual={status}
                      blocos={slugs}
                      contagens={contagens}
                      total={doBloco.length}
                    />
                    <ol className={estilos.itens}>
                      {lista.map((pauta) => (
                        <li
                          key={pauta.slug}
                          style={{ '--c': STATUS[pauta.status].ponto } as CSSProperties}
                        >
                          <span className={estilos.itemIcone}>
                            <Icone nome={ICONE_DA_ETAPA[pauta.status]} />
                          </span>
                          <span>
                            <Link href={`/p/${pauta.slug}`}>{pauta.titulo}</Link>
                            <small>
                              <span>{STATUS[pauta.status].rotulo}</span>
                              <span>{pauta.bloco_nome ?? 'Todo o campus'}</span>
                              <span>
                                {formatarNumero(pauta.apoios)} de {formatarNumero(pauta.meta)}{' '}
                                apoios
                              </span>
                            </small>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </ListaDePautas>
                </div>
              </>
            )}
          </div>
        </section>

        {doBloco.length > 0 && (
          <section
            id="numeros"
            data-cena="numeros"
            className={estilos.cena}
            aria-label="Apoios e números"
          >
            <div className={[estilos.palco, estilos.palcoNumeros].join(' ')}>
              <div className={estilos.principal} data-subir="">
                <ApoiosPorSemana semanas={semanas} />
              </div>
              <div className={estilos.lateral}>
                <div data-subir="">
                  <CaminhoDasPautas pautas={doBloco} />
                </div>
                <div data-subir="">
                  <PautasPorGrupo
                    id="categorias-titulo"
                    titulo="Apoios por categoria"
                    vazio="Nenhum apoio por categoria ainda."
                    grupos={apoiosPorCategoria(doBloco)}
                  />
                </div>
                {/* Com um bloco escolhido, o gráfico por bloco teria uma barra só. */}
                {escolhidos.length !== 1 && (
                  <div data-subir="">
                    <PautasPorGrupo
                      id="blocos-titulo"
                      titulo="Blocos mais ativos"
                      vazio="Nenhum apoio por bloco ainda."
                      grupos={blocosMaisAtivos(doBloco)}
                    />
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <section id="relatar" data-cena="fim" className={estilos.cena} aria-labelledby="fim-titulo">
          <div className={[estilos.palco, estilos.palcoFim].join(' ')}>
            <h2 id="fim-titulo" className={estilos.letreiro}>
              <span className={estilos.linhaFim}>
                <span data-linha-fim="">Acenda uma luz</span>
              </span>{' '}
              <span className={estilos.linhaFim}>
                <span data-linha-fim="" className={estilos.luz}>
                  no seu bloco
                </span>
              </span>
            </h2>
            <div className={estilos.acoesFim} data-acao="">
              {/* Com a lista vazia, o "Relatar um problema" já aparece na ListaVazia. */}
              {lista.length > 0 && <BotaoRelatar />}
              <Link href={linkParaLista} className={componentes.botaoSecundario}>
                {status.length > 0 || slugs.length > 0
                  ? `Ver ${lista.length === 1 ? 'a pauta filtrada' : `as ${String(lista.length)} pautas filtradas`}`
                  : 'Buscar nas pautas'}
              </Link>
              <Link href="/mapa" className={componentes.botaoSecundario}>
                Ver no mapa
              </Link>
            </div>
            <footer className={estilos.rodape}>
              <nav aria-label="Mais do Lumens">
                <Link href="/pautas">Todas as pautas</Link>
                <Link href="/manual">Manual</Link>
                <Link href="/privacidade">Política de privacidade</Link>
                {/* Arquivo, não página: o <a> comum baixa o CSV em vez de navegar. */}
                <a href="/dados.csv" download>
                  Dados abertos (CSV)
                </a>
              </nav>
            </footer>
          </div>
        </section>
      </Cinema>
    </main>
  );
}
