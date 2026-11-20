import type { Conquista } from '@lumens/contratos';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import type { CSSProperties } from 'react';
import { formatarNumero } from '../../componentes/BarraApoios';
import { Hud, type ItemDoHud } from '../../componentes/Hud';
import { Icone } from '../../componentes/Icone';
import { CampusInterno } from '../../componentes/internas/CampusInterno';
import { FundoInterno } from '../../componentes/internas/FundoInterno';
import internas from '../../componentes/internas/internas.module.css';
import { predioDoBloco } from '../../componentes/internas/predioPorNome';
import { formatarDia } from '../../componentes/pauta/LinhaDoTempo';
import { urlFoto } from '../../componentes/pauta/foto';
import { buscarConquistas } from '../../dados/api';
import { anoEmMaceio, diasEntre, textoDias } from '../../dados/dias';
import { metadadosDaMarca } from '../../metadados';
import estilos from './page.module.css';

export const metadata: Metadata = metadadosDaMarca({
  caminho: '/conquistas',
  title: 'Conquistas · Lumens',
  description: 'Pautas estudantis da UFAL que viraram conquista.',
});

const COR_CONQUISTA = '#36864f';

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
  const predio = predioDoBloco(null, conquista.bloco_nome);
  const rotuloMapa = predio?.sigla || conquista.bloco_nome || '';
  const foto = conquista.foto === null ? null : urlFoto(conquista.foto);
  return (
    <li
      className={estilos.conquista}
      data-foco=""
      data-predio={predio?.id}
      data-cor={COR_CONQUISTA}
      data-rotulo={rotuloMapa ? `${rotuloMapa} · conquistada` : ''}
    >
      <span className={estilos.no} aria-hidden="true">
        <Icone nome="trofeu" />
      </span>
      <article className={estilos.card} aria-labelledby={id}>
        <div className={estilos.topo}>
          <span className={internas.etapa} style={{ '--c': COR_CONQUISTA } as CSSProperties}>
            <Icone nome="trofeu" />
            Conquistada
          </span>
          {conquista.proposta_executada && (
            <span className={estilos.tag}>
              <Icone nome="pessoas" />
              Solução da comunidade
            </span>
          )}
        </div>
        <h2 id={id} className={estilos.titulo}>
          <Link href={`/p/${conquista.pauta_slug}`}>{conquista.titulo}</Link>
        </h2>
        {conquista.bloco_nome && (
          <p className={internas.onde}>
            <span>
              <Icone nome="local" />
              {conquista.bloco_nome}
            </span>
          </p>
        )}
        {conquista.o_que_foi_feito && (
          <p className={estilos.feito}>
            <span className={estilos.feitoRotulo}>O que foi feito:</span>{' '}
            {conquista.o_que_foi_feito}
          </p>
        )}
        {foto && (
          <img
            className={estilos.fotoDoFeito}
            src={foto}
            alt={`Foto do que foi feito: ${conquista.titulo}`}
            loading="lazy"
          />
        )}
        <dl className={estilos.numeros}>
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
          {conquista.conquistada_em && (
            <div className={estilos.dataItem}>
              <dt>Conquistada em</dt>
              <dd>
                <time dateTime={conquista.conquistada_em}>
                  {formatarDia(conquista.conquistada_em)}
                </time>
              </dd>
            </div>
          )}
        </dl>
        {dias !== null && conquista.conquistada_em && (
          <>
            <div className={estilos.duracao} aria-hidden="true">
              <span
                style={{ width: `${String(Math.min(100, Math.max(8, (dias / 60) * 100)))}%` }}
              />
            </div>
            <small className={estilos.datas}>
              <span>criada em {formatarDia(conquista.criada_em)}</span>
              <span>conquistada em {formatarDia(conquista.conquistada_em)}</span>
            </small>
          </>
        )}
      </article>
    </li>
  );
}

export default async function PaginaConquistas() {
  // Sem parâmetro na URL, o `next build` pré-renderizaria a página chamando a API (que pode nem
  // estar no ar). O `connection()` deixa a renderização para a hora do acesso.
  await connection();
  // Erro da API sobe e cai no `error.tsx`.
  const conquistas = await buscarConquistas();

  const totalApoios = conquistas.reduce((s, c) => s + c.apoios, 0);
  const diasValidos = conquistas
    .map(diasAteEntrega)
    .filter((d): d is number => d !== null && d >= 0);
  const mediaDias =
    diasValidos.length > 0
      ? Math.round(diasValidos.reduce((s, d) => s + d, 0) / diasValidos.length)
      : null;

  const anos: string[] = [];
  for (const c of conquistas) {
    const ano = anoDaConquista(c);
    if (ano && !anos.includes(ano)) anos.push(ano);
  }

  const hud: ItemDoHud[] = [
    { id: 'resumo', rotulo: 'Resumo', icone: 'trofeu' },
    ...anos.map((ano) => ({
      id: `ano-${ano}`,
      rotulo: `Conquistas de ${ano}`,
      numero: ano.slice(-2),
    })),
    { id: 'andamento', rotulo: 'Pautas em andamento', icone: 'abrir' },
  ];

  let ultimoAno = '';

  return (
    <FundoInterno mapa={<CampusInterno />} comJanela comRotulo>
      {conquistas.length > 0 && <Hud itens={hud} rotulo="Partes das conquistas" />}
      <main className={internas.conteudo}>
        <div className={internas.cabeca} id="resumo">
          <p className={internas.sobre}>
            <Icone nome="trofeu" />
            Memorial · Campus A. C. Simões
          </p>
          <h1>
            O que os estudantes <em>já conquistaram</em>
          </h1>
          <p className={internas.sub}>
            Cada conquista foi confirmada por quem apoiou. Fica aqui mesmo quando as gestões do DA e
            do DCE mudam.
          </p>
          {conquistas.length > 0 && (
            <dl className={estilos.resumo}>
              <div>
                <Icone nome="trofeu" />
                <dt>{conquistas.length === 1 ? 'conquista' : 'conquistas'}</dt>
                <dd>{formatarNumero(conquistas.length)}</dd>
              </div>
              <div>
                <Icone nome="apoio" />
                <dt>apoios somados</dt>
                <dd>{formatarNumero(totalApoios)}</dd>
              </div>
              {mediaDias !== null && (
                <div>
                  <Icone nome="calendario" />
                  <dt>dias em média até a entrega</dt>
                  <dd>{formatarNumero(mediaDias)}</dd>
                </div>
              )}
            </dl>
          )}
        </div>

        {conquistas.length === 0 ? (
          <div role="status" className={internas.estadoVazio}>
            <p className={internas.estadoTitulo}>Ainda não tem conquista.</p>
            <p>Quando uma pauta for entregue, ela aparece aqui. Apoie as que estão abertas.</p>
            <div className={internas.estadoAcoes}>
              <Link href="/pautas" className={internas.botao}>
                Ver as pautas
              </Link>
            </div>
          </div>
        ) : (
          <>
            <ol className={estilos.linha}>
              {conquistas.flatMap((conquista) => {
                const ano = anoDaConquista(conquista);
                const marcadorAno =
                  ano && ano !== ultimoAno
                    ? [
                        <li
                          key={`ano-${ano}`}
                          className={estilos.ano}
                          id={`ano-${ano}`}
                          aria-hidden="true"
                        >
                          <span>{ano}</span>
                        </li>,
                      ]
                    : [];
                if (ano) ultimoAno = ano;
                return [
                  ...marcadorAno,
                  <ItemConquista key={conquista.pauta_slug} conquista={conquista} />,
                ];
              })}
            </ol>
            <section className={estilos.andamento} id="andamento">
              <div>
                <h2>Ainda tem pauta a caminho</h2>
                <p>Veja as pautas abertas que estão juntando apoios ou sendo cobradas agora.</p>
              </div>
              <Link href="/pautas" className={[internas.botao, internas.botaoPrincipal].join(' ')}>
                <Icone nome="abrir" />
                Ver as pautas em andamento
              </Link>
            </section>
          </>
        )}
      </main>
    </FundoInterno>
  );
}
