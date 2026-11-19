import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { rotuloDaCategoria, STATUS_PUBLICOS, type StatusPublico } from '@lumens/contratos';
import componentes from '../componentes/componentes.module.css';
import { ApoiosPorSemana } from '../componentes/ApoiosPorSemana';
import { BarraApoios, formatarNumero } from '../componentes/BarraApoios';
import { BotaoRelatar } from '../componentes/BotaoWhatsApp';
import { CaminhoDasPautas } from '../componentes/CaminhoDasPautas';
import { FiltroBloco } from '../componentes/FiltroBloco';
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
import { PREDIOS } from '../componentes/mapa/predios';
import { maisUrgente, marcadoresDoMapa } from '../componentes/mapa/urgencia';
import { buscarApoiosPorSemana, buscarBlocos, buscarPautas } from '../dados/api';
import { apoiosPorCategoria, blocosMaisAtivos } from '../dados/distribuicao';
import { urlDosFiltros } from '../dados/filtros';
import { blocoDaUrl, pautasPublicas, resumoDosTotais, totais } from '../dados/pautas-publicas';
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

/** Filtro por etapa em links: funciona sem JavaScript e a URL guarda a escolha. */
function FiltroEtapas({
  atual,
  bloco,
  contagens,
  total,
}: {
  atual: StatusPublico | undefined;
  bloco: string | undefined;
  contagens: Record<string, number>;
  total: number;
}) {
  return (
    <nav className={estilos.filtros} aria-label="Filtrar por etapa" data-rola="">
      <Link
        href={urlDosFiltros(undefined, bloco)}
        scroll={false}
        className={estilos.filtro}
        aria-current={atual ? undefined : 'true'}
      >
        Todas<small>{total}</small>
      </Link>
      {STATUS_PUBLICOS.filter((etapa) => (contagens[etapa] ?? 0) > 0 || etapa === atual).map(
        (etapa) => (
          <Link
            key={etapa}
            href={urlDosFiltros(etapa, bloco)}
            scroll={false}
            className={estilos.filtro}
            aria-current={etapa === atual ? 'true' : undefined}
          >
            <Icone nome={ICONE_DA_ETAPA[etapa]} />
            {STATUS[etapa].rotulo}
            <small>{contagens[etapa] ?? 0}</small>
          </Link>
        ),
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
  searchParams: Promise<{ bloco?: string | string[]; status?: string | string[] }>;
}) {
  // Erro da API sobe e cai no `error.tsx`. Os totais saem da lista, e não do GET /resumo, porque
  // acompanham o filtro de bloco e o /resumo é sempre do campus inteiro.
  // O `searchParams` vem antes da primeira busca: lê-lo torna a página dinâmica, então o
  // `next build` não tenta pré-renderizar a home chamando a API (que pode nem estar no ar).
  const { bloco: blocoParam, status: statusParam } = await searchParams;
  const blocos = await buscarBlocos();
  const bloco = blocoDaUrl(blocos, blocoParam);
  const status =
    typeof statusParam === 'string'
      ? STATUS_PUBLICOS.find((etapa) => etapa === statusParam)
      : undefined;
  // Uma busca só, sem o filtro de status: a API ordena e o `pautasPublicas` repete a regra como
  // segunda barreira. O status filtra a lista aqui; as contagens do filtro e o mapa usam as pautas
  // do bloco inteiras, para não mostrar "Sem pautas" em bloco que só não tem aquele status.
  const [pautasDaApi, semanas] = await Promise.all([
    buscarPautas(bloco?.slug),
    buscarApoiosPorSemana(bloco?.slug),
  ]);
  const todas = pautasPublicas(pautasDaApi, bloco);
  const lista = (status ? todas.filter((pauta) => pauta.status === status) : todas) as (Pauta & {
    status: StatusPublico;
  })[];
  const contagens = Object.fromEntries(
    STATUS_PUBLICOS.map((etapa) => [etapa, todas.filter((pauta) => pauta.status === etapa).length]),
  );
  const contagem = totais(lista);
  const { abertas, apoios, conquistas } = contagem;
  const onde = bloco?.nome ?? 'Todo o campus';
  const marcadores = marcadoresDoMapa(blocos, todas);
  const destaque = maisUrgente(todas);
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
  const resumoDaLista = `${String(lista.length)} ${lista.length === 1 ? 'pauta pública' : 'pautas públicas'}${status ? ` em ${STATUS[status].rotulo.toLowerCase()}` : ''} · ${onde}`;

  return (
    <main className={[estilos.home, 'paginaNoite'].join(' ')}>
      <Hud
        itens={destaque ? HUD : HUD.filter((h) => h.id !== 'em-destaque')}
        rotulo="Partes da página"
      />
      <Cinema
        key={`${bloco?.slug ?? ''}-${status ?? ''}`}
        mapa={<CampusNoturno marcadores={marcadores} />}
        pinos={pinos}
        foco={predioDoBloco(bloco?.slug ?? null)}
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
            {/* Os totais acompanham o filtro: o título é o nome do bloco escolhido. A região viva é só
                o resumo escondido: os números visíveis sobem com animação e anunciariam cada quadro. */}
            <section className={estilos.totais} aria-labelledby="totais-titulo" data-contadores="">
              <p role="status" className={estilos.somenteLeitor}>
                {resumoDosTotais(onde, contagem)}
              </p>
              <div className={estilos.totaisTopo}>
                <h2 id="totais-titulo">{onde}</h2>
                <FiltroBloco blocos={blocos} atual={bloco?.slug} status={status} />
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
                bloco={bloco?.slug}
                contagens={contagens}
                total={todas.length}
              />
            </div>
            {lista.length === 0 ? (
              <div className={estilos.vazio}>
                <ListaVazia bloco={bloco} status={status} />
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
                      bloco={bloco?.slug}
                      contagens={contagens}
                      total={todas.length}
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

        {todas.length > 0 && (
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
                  <CaminhoDasPautas pautas={todas} />
                </div>
                <div data-subir="">
                  <PautasPorGrupo
                    id="categorias-titulo"
                    titulo="Apoios por categoria"
                    vazio="Nenhum apoio por categoria ainda."
                    grupos={apoiosPorCategoria(todas)}
                  />
                </div>
                {/* Com um bloco escolhido, o gráfico por bloco teria uma barra só. */}
                {!bloco && (
                  <div data-subir="">
                    <PautasPorGrupo
                      id="blocos-titulo"
                      titulo="Blocos mais ativos"
                      vazio="Nenhum apoio por bloco ainda."
                      grupos={blocosMaisAtivos(todas)}
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
              <Link href="/mapa" className={componentes.botaoSecundario}>
                Ver no mapa
              </Link>
            </div>
            <footer className={estilos.rodape}>
              <nav aria-label="Mais do Lumens">
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
