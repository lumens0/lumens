import { agruparEventosIguais, rotuloDeResponsaveis, type AtividadeItem } from '@lumens/contratos';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Hud, type ItemDoHud } from '../../componentes/Hud';
import { Icone, ICONE_DA_ETAPA, type NomeDoIcone } from '../../componentes/Icone';
import { CampusInterno } from '../../componentes/internas/CampusInterno';
import { FundoInterno } from '../../componentes/internas/FundoInterno';
import internas from '../../componentes/internas/internas.module.css';
import { predioDoBloco } from '../../componentes/internas/predioPorNome';
import { formatarData, rotuloDoPapel, rotuloEvento } from '../../componentes/pauta/LinhaDoTempo';
import { STATUS } from '../../componentes/StatusPill';
import { buscarAtividade, buscarPautas } from '../../dados/api';
import type { Pauta, StatusPauta } from '../../dados/tipos';
import { metadadosDaMarca } from '../../metadados';
import { nomeDoCanal } from '../../whatsapp';
import estilos from './page.module.css';

export const metadata: Metadata = metadadosDaMarca({
  caminho: '/atividade',
  title: 'Atividade · Lumens',
  description: 'O que mudou por último nas pautas estudantis da UFAL.',
});

// Teto para a página da URL: além dele o offset nem cabe numa conta segura.
const PAGINA_MAXIMA = 100_000;

/** `?pagina=` válido é inteiro de 1 até o teto; qualquer outra coisa vira a primeira página. */
function paginaDaUrl(valor: string | string[] | undefined): number {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  if (!texto || !/^\d+$/.test(texto)) return 1;
  const pagina = Number(texto);
  return pagina >= 1 && pagina <= PAGINA_MAXIMA ? pagina : 1;
}

type Tom = 'azul' | 'roxo' | 'turquesa' | 'ambar' | 'amarelo' | 'vermelho' | 'verde';

const COR_DO_TOM: Record<Tom, string> = {
  azul: '#356fc2',
  roxo: '#8959bd',
  turquesa: '#168b86',
  ambar: '#c05b12',
  amarelo: '#a98216',
  vermelho: '#d0443b',
  verde: '#36864f',
};

const TOM: Record<string, Tom> = {
  pauta_aprovada: 'azul',
  relato_aprovado: 'azul',
  caminho_aberto: 'azul',
  proposta_publicada: 'azul',
  owner_entrou: 'azul',
  meta_batida: 'roxo',
  protocolo_registrado: 'ambar',
  prazo_prorrogado: 'ambar',
  protocolo_corrigido: 'ambar',
  promessa_registrada: 'ambar',
  promessa_remarcada: 'ambar',
  conferencia_aberta: 'ambar',
  resposta_oficial_recebida: 'verde',
  proposta_executada: 'verde',
  conferencia_apurada: 'verde',
};

const TOM_DO_STATUS: Partial<Record<StatusPauta, Tom>> = {
  juntando_apoios: 'azul',
  meta_batida: 'roxo',
  cobrando: 'ambar',
  prometido: 'turquesa',
  entregue_em_parte: 'amarelo',
  descumprida: 'vermelho',
  conquistada: 'verde',
};

const ICONE_DO_TIPO: Record<string, NomeDoIcone> = {
  pauta_aprovada: 'vistoSelo',
  relato_aprovado: 'relato',
  caminho_aberto: 'rota',
  proposta_publicada: 'pessoas',
  owner_entrou: 'pessoas',
  owner_removido: 'pessoas',
  meta_batida: 'alvo',
  meta_ajustada: 'alvo',
  bloco_corrigido: 'local',
  pauta_urgente: 'flag',
  protocolo_registrado: 'documento',
  protocolo_corrigido: 'documento',
  prazo_prorrogado: 'calendario',
  promessa_registrada: 'acordo',
  promessa_remarcada: 'calendario',
  conferencia_aberta: 'vistoSelo',
  conferencia_apurada: 'trofeu',
  resposta_oficial_recebida: 'predioPublico',
  proposta_executada: 'trofeu',
};

/** O status para o qual a pauta foi, num evento `status_alterado` com `dados.para` conhecido. */
function statusNovo(item: AtividadeItem): StatusPauta | undefined {
  if (item.tipo !== 'status_alterado') return undefined;
  const para = item.dados.para;
  return typeof para === 'string' && para in STATUS ? (para as StatusPauta) : undefined;
}

function textoDoEvento(item: AtividadeItem, quantidade = 1): string {
  const grupo = rotuloDeResponsaveis(item.tipo, item.dados, quantidade);
  if (grupo !== undefined) return grupo;
  const doPapel = rotuloDoPapel(item.tipo, item.dados);
  if (doPapel !== undefined) return doPapel;
  if (item.tipo === 'meta_ajustada') {
    const antes = item.dados.metaAntes;
    const depois = item.dados.metaDepois;
    const motivo = item.dados.motivo;
    const valorAntes = typeof antes === 'number' ? String(antes) : '?';
    const valorDepois = typeof depois === 'number' ? String(depois) : '?';
    return `Meta ajustada pela curadoria de ${valorAntes} para ${valorDepois}: ${typeof motivo === 'string' ? motivo : '?'}`;
  }
  if (item.tipo === 'bloco_corrigido') {
    const antes = item.dados.blocoAntes;
    const depois = item.dados.blocoDepois;
    const blocoAntes = typeof antes === 'string' ? antes : 'Todo o campus';
    const blocoDepois = typeof depois === 'string' ? depois : 'Todo o campus';
    return `Bloco corrigido pela curadoria: ${blocoAntes} → ${blocoDepois}`;
  }
  if (item.tipo === 'pauta_urgente') {
    return item.dados.urgente === true
      ? 'Marcada como urgente pela curadoria'
      : 'Deixou de ser urgente';
  }
  if (['prazo_prorrogado', 'protocolo_corrigido', 'promessa_remarcada'].includes(item.tipo)) {
    const data = (valor: unknown) => {
      if (typeof valor !== 'string') return '?';
      return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor.split('-').reverse().join('/') : valor;
    };
    const motivo = typeof item.dados.motivo === 'string' ? ` · Motivo: ${item.dados.motivo}` : '';
    const fonte = typeof item.dados.fonte === 'string' ? ` · Fonte: ${item.dados.fonte}` : '';
    return `${rotuloEvento(item.tipo)}: ${data(item.dados.data_antiga)} → ${data(item.dados.data_nova)}${motivo}${fonte}`;
  }
  const novo = statusNovo(item);
  return novo ? `${rotuloEvento(item.tipo)} para ${STATUS[novo].rotulo}` : rotuloEvento(item.tipo);
}

function tomDoEvento(item: AtividadeItem): Tom | undefined {
  const novo = statusNovo(item);
  return novo ? TOM_DO_STATUS[novo] : TOM[item.tipo];
}

function iconeDoEvento(item: AtividadeItem): NomeDoIcone {
  const novo = statusNovo(item);
  if (novo && novo in ICONE_DA_ETAPA) {
    return ICONE_DA_ETAPA[novo as keyof typeof ICONE_DA_ETAPA];
  }
  return ICONE_DO_TIPO[item.tipo] ?? 'atividade';
}

const linkDaPagina = (pagina: number) =>
  pagina === 1 ? '/atividade' : `/atividade?pagina=${String(pagina)}`;

const formatoChaveDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio' });
const formatoDiaMes = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Maceio',
  day: 'numeric',
  month: 'long',
});
const formatoDiaSemana = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Maceio',
  weekday: 'long',
});
const formatoAno = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Maceio',
  year: 'numeric',
});

const capitalizar = (s: string) => (s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default async function PaginaAtividade({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string | string[] }>;
}) {
  const pagina = paginaDaUrl((await searchParams).pagina);
  // Erro da API sobe e cai no `error.tsx`. As pautas são opcionais: servem só para acender o
  // prédio certo no campus atrás da lista sem mudar o contrato do GET /atividade.
  const [{ itens, proximo }, pautas] = await Promise.all([
    buscarAtividade(pagina),
    buscarPautas().catch((): Pauta[] => []),
  ]);

  const pautaPorSlug = new Map(pautas.map((p) => [p.slug, p]));
  const agrupados = agruparEventosIguais(
    itens,
    (item) => item.criado_em,
    (item) => item.pauta_slug,
  );

  // Agrupa os eventos por dia no calendário de Maceió, mantendo a ordem da API (mais novo primeiro).
  const dias: {
    chave: string;
    numero: string;
    titulo: string;
    sub: string;
    eventos: typeof agrupados;
  }[] = [];
  for (const entrada of agrupados) {
    const data = new Date(entrada.evento.criado_em);
    const chave = formatoChaveDia.format(data);
    const ultimo = dias.at(-1);
    if (ultimo && ultimo.chave === chave) {
      ultimo.eventos.push(entrada);
    } else {
      dias.push({
        chave,
        numero: chave.slice(-2),
        titulo: formatoDiaMes.format(data),
        sub: `${capitalizar(formatoDiaSemana.format(data))} · ${formatoAno.format(data)}`,
        eventos: [entrada],
      });
    }
  }

  const hud: ItemDoHud[] = [
    { id: 'topo', rotulo: 'Acontecendo no campus', icone: 'atividade' },
    ...dias.slice(0, 6).map((d) => ({
      id: `dia-${d.chave}`,
      rotulo: d.titulo,
      numero: d.numero,
    })),
  ];

  return (
    <FundoInterno mapa={<CampusInterno />} comJanela comRotulo>
      {dias.length > 0 && <Hud itens={hud} rotulo="Dias da atividade" />}
      <main className={internas.conteudo}>
        <div className={internas.cabeca} id="topo">
          <p className={internas.sobre}>
            <Icone nome="atividade" />
            Atividade · o que mudou nas pautas
          </p>
          <h1>
            Acontecendo <em>no campus</em>
          </h1>
          <p className={internas.sub}>
            Cada linha vem de uma ação no {nomeDoCanal()} ou de uma resposta oficial. A mais recente
            fica em cima, e o mapa mostra onde ela aconteceu.
          </p>
        </div>

        {itens.length === 0 ? (
          <div role="status" className={internas.estadoVazio}>
            <p className={internas.estadoTitulo}>
              {pagina === 1 ? 'Ainda não tem atividade.' : 'Esta página não tem atividade.'}
            </p>
            {pagina > 1 && (
              <div className={internas.estadoAcoes}>
                <Link href={linkDaPagina(1)} className={internas.botao}>
                  Ver a atividade mais recente
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className={estilos.feed}>
            {dias.map((dia) => (
              <section
                key={dia.chave}
                className={estilos.dia}
                id={`dia-${dia.chave}`}
                aria-labelledby={`t-${dia.chave}`}
              >
                <h2 id={`t-${dia.chave}`}>
                  {dia.titulo}
                  <small>{dia.sub}</small>
                </h2>
                <ol>
                  {dia.eventos.map(({ evento: item, quantidade }, i) => {
                    const tom = tomDoEvento(item);
                    const cor = tom ? COR_DO_TOM[tom] : '#5f6496';
                    const pauta = pautaPorSlug.get(item.pauta_slug);
                    const predio = predioDoBloco(
                      pauta?.bloco_slug,
                      pauta?.bloco_nome ?? item.pauta_titulo,
                    );
                    const onde = pauta?.bloco_nome ?? predio?.sigla ?? null;
                    const rotulo = textoDoEvento(item, quantidade);
                    return (
                      <li
                        key={`${String(pagina)}-${dia.chave}-${String(i)}`}
                        className={estilos.evento}
                        data-tom={tom}
                        data-foco=""
                        data-predio={predio?.id}
                        data-cor={cor}
                        data-rotulo={predio ? `${predio.sigla || onde || ''} · ${rotulo}` : ''}
                        style={{ '--c': cor } as CSSProperties}
                      >
                        <time dateTime={item.criado_em} className={estilos.quando}>
                          {formatarData(item.criado_em)}
                        </time>
                        <span className={estilos.icone} aria-hidden="true">
                          <Icone nome={iconeDoEvento(item)} />
                        </span>
                        <div className={estilos.texto}>
                          <b className={estilos.rotulo}>{rotulo}</b>
                          <Link className={estilos.eventoPauta} href={`/p/${item.pauta_slug}`}>
                            {item.pauta_titulo}
                          </Link>
                          {onde && (
                            <p className={[internas.onde, estilos.ondeLinha].join(' ')}>
                              <span>
                                <Icone nome="local" />
                                {onde}
                              </span>
                            </p>
                          )}
                        </div>
                        <Icone nome="proxima" className={estilos.seta} />
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}

            {/* Página além do fim já oferece a volta no estado vazio; aqui não repete. */}
            {((pagina > 1 && itens.length > 0) || proximo !== null) && (
              <nav aria-label="Páginas da atividade" className={estilos.paginacao}>
                {pagina > 1 ? (
                  <Link className={internas.botao} rel="prev" href={linkDaPagina(pagina - 1)}>
                    ← Mais recentes
                  </Link>
                ) : (
                  <span />
                )}
                {proximo !== null && (
                  <Link className={internas.botao} rel="next" href={linkDaPagina(pagina + 1)}>
                    Mais antigas →
                  </Link>
                )}
              </nav>
            )}
          </div>
        )}
      </main>
    </FundoInterno>
  );
}
