import type { Metadata } from 'next';
import Link from 'next/link';
import { LinhaDePauta } from '../../componentes/lista/LinhaDePauta';
import { FiltrosDaLista } from '../../componentes/lista/FiltrosDaLista';
import estilos from '../../componentes/lista/lista.module.css';
import { ListaVazia } from '../../componentes/ListaVazia';
import { STATUS } from '../../componentes/StatusPill';
import { buscarBlocos, buscarPautas } from '../../dados/api';
import { blocosDaUrl, filtrarPautas, statusDaUrl, type ParamDaUrl } from '../../dados/filtros';
import { blocosDaFolha } from '../../dados/folha';
import {
  buscarNasPautas,
  janelaDePaginas,
  ordemDaUrl,
  ordenarPautas,
  paginaDaUrl,
  paginar,
  sugestoesDeBloco,
  urlDaLista,
} from '../../dados/lista';
import { pautasPublicas } from '../../dados/pautas-publicas';
import { siglasDosBlocos } from '../../dados/siglas';
import { metadadosDaMarca } from '../../metadados';
import pagina from '../page.module.css';
import { STATUS_PUBLICOS } from '@lumens/contratos';
import { formatarNumero } from '../../componentes/BarraApoios';

export const metadata: Metadata = metadadosDaMarca({
  caminho: '/pautas',
  title: 'Pautas · Lumens',
});

const primeiro = (param: ParamDaUrl) => (Array.isArray(param) ? param[0] : param) ?? '';

/**
 * A aba Pautas: uma busca só (título, bloco, etapa e "urgente"), ordenação, filtros múltiplos de
 * etapa e bloco, e 8 pautas por página. Tudo na URL (`?q=&ordem=&status=&bloco=&pagina=`) e
 * calculado no servidor sobre a lista inteira que a API de leitura já entrega.
 */
export default async function Pautas({
  searchParams,
}: {
  searchParams: Promise<{
    q?: ParamDaUrl;
    ordem?: ParamDaUrl;
    status?: ParamDaUrl;
    bloco?: ParamDaUrl;
    pagina?: ParamDaUrl;
  }>;
}) {
  // Erro da API sobe e cai no `error.tsx`. O `searchParams` vem antes da primeira busca: lê-lo torna
  // a página dinâmica, então o `next build` não tenta pré-renderizá-la chamando a API.
  const params = await searchParams;
  const [blocos, daApi] = await Promise.all([buscarBlocos(), buscarPautas()]);
  const siglas = siglasDosBlocos(blocos);
  const q = primeiro(params.q).trim();
  const ordem = ordemDaUrl(params.ordem);
  const status = statusDaUrl(params.status);
  const escolhidos = blocosDaUrl(blocos, params.bloco);
  const slugs = escolhidos.map((b) => b.slug);

  const campus = pautasPublicas(daApi);
  // Os blocos e a busca recortam as contagens das etapas; a etapa filtra só a lista.
  const doRecorte = buscarNasPautas(
    filtrarPautas(campus, { status: [], blocos: escolhidos }),
    q,
    siglas,
    (s) => STATUS[s].rotulo,
  );
  const etapas = Object.fromEntries(
    STATUS_PUBLICOS.map((e) => [e, doRecorte.filter((p) => p.status === e).length]),
  ) as Record<(typeof STATUS_PUBLICOS)[number], number>;
  const filtradas = ordenarPautas(filtrarPautas(doRecorte, { status, blocos: [] }), ordem);
  const lista = paginar(filtradas, paginaDaUrl(params.pagina));

  const todosOsBlocos = blocosDaFolha(blocos, siglas, campus, status);
  const sugestoes = sugestoesDeBloco(todosOsBlocos, q, slugs);
  const aqui = { q, ordem, status, bloco: slugs };
  const etiquetas = [
    ...status.map((e) => ({
      texto: STATUS[e].rotulo,
      rotulo: `Tirar o filtro de etapa ${STATUS[e].rotulo}`,
      href: urlDaLista({ ...aqui, status: status.filter((s) => s !== e) }),
    })),
    ...escolhidos.map((b) => ({
      texto: b.nome,
      rotulo: `Tirar o filtro de bloco ${b.nome}`,
      href: urlDaLista({ ...aqui, bloco: slugs.filter((s) => s !== b.slug) }),
    })),
  ];
  const filtrando = etiquetas.length > 0 || q !== '';
  const botoes = janelaDePaginas(lista.pagina, lista.paginas);

  return (
    <main className={[pagina.pagina, pagina.comRodape].join(' ')}>
      <header className={estilos.cabecalho}>
        <h1>
          Pautas <small className={estilos.total}>{formatarNumero(lista.total)}</small>
        </h1>
        <Link href="/" className={estilos.verPainel}>
          Ver o painel de números
        </Link>
      </header>

      <FiltrosDaLista
        q={q}
        ordem={ordem}
        status={status}
        bloco={slugs}
        etapas={etapas}
        totalDaBusca={doRecorte.length}
        blocos={todosOsBlocos}
        totalDeBlocos={blocos.length}
        sugestoes={
          sugestoes.length > 0 ? (
            <ul className={[estilos.chips, estilos.quebra, estilos.sugestoes].join(' ')}>
              <li className={estilos.rotulo}>Filtrar pelo bloco:</li>
              {sugestoes.map((b) => (
                <li key={b.slug}>
                  <Link
                    href={urlDaLista({ ordem, status, bloco: [...slugs, b.slug] })}
                    className={estilos.chip}
                    title={b.nome}
                  >
                    {b.nome}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null
        }
        ativos={
          etiquetas.length > 0 ? (
            <ul className={estilos.etiquetas} aria-label="Filtros ativos">
              {etiquetas.map((etiqueta) => (
                <li key={etiqueta.href}>
                  <Link
                    href={etiqueta.href}
                    className={estilos.etiqueta}
                    aria-label={etiqueta.rotulo}
                    scroll={false}
                  >
                    {etiqueta.texto} <span aria-hidden="true">×</span>
                  </Link>
                </li>
              ))}
              {etiquetas.length >= 2 && (
                <li>
                  <Link href={urlDaLista({ ordem })} className={estilos.limpar}>
                    Limpar tudo
                  </Link>
                </li>
              )}
            </ul>
          ) : null
        }
      />

      {lista.total === 0 ? (
        campus.length === 0 ? (
          <div className={estilos.vazioDoCampus}>
            <ListaVazia bloco={undefined} />
          </div>
        ) : (
          <ul className={estilos.lista}>
            <li className={estilos.vazio} role="status">
              Nenhuma pauta nessa combinação.{' '}
              {filtrando && <Link href="/pautas">Limpar filtros</Link>}
            </li>
          </ul>
        )
      ) : (
        <ul className={estilos.lista}>
          {lista.itens.map((pauta) => (
            <LinhaDePauta key={pauta.slug} pauta={pauta} />
          ))}
        </ul>
      )}

      <nav aria-label="Páginas da lista" className={estilos.paginacao}>
        <p role="status" className={estilos.resultado}>
          {`Mostrando ${String(lista.de)} a ${String(lista.ate)} de ${formatarNumero(lista.total)} ${lista.total === 1 ? 'pauta' : 'pautas'}`}
        </p>
        {lista.paginas > 1 && (
          <div className={estilos.controlesDePagina}>
            {lista.pagina > 1 ? (
              <Link href={urlDaLista({ ...aqui, pagina: lista.pagina - 1 })} rel="prev">
                Anterior
              </Link>
            ) : (
              <span className={estilos.desligado}>Anterior</span>
            )}
            <ul className={estilos.numeros}>
              {botoes.map((n, i) => (
                <li key={`${String(n)}-${String(i)}`}>
                  {n === '…' ? (
                    <span className={estilos.reticencias} aria-hidden="true">
                      …
                    </span>
                  ) : n === lista.pagina ? (
                    <span
                      className={estilos.atual}
                      aria-current="page"
                      aria-label={`Página ${String(n)}`}
                    >
                      {n}
                    </span>
                  ) : (
                    <Link
                      href={urlDaLista({ ...aqui, pagina: n })}
                      aria-label={`Página ${String(n)}`}
                    >
                      {n}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            {lista.pagina < lista.paginas ? (
              <Link href={urlDaLista({ ...aqui, pagina: lista.pagina + 1 })} rel="next">
                Próxima
              </Link>
            ) : (
              <span className={estilos.desligado}>Próxima</span>
            )}
          </div>
        )}
      </nav>

      <footer className={pagina.rodape}>
        <nav aria-label="Mais do Lumens" className={pagina.navegacao}>
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
