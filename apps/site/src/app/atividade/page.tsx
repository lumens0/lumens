import { agruparEventosIguais, rotuloDeResponsaveis, type AtividadeItem } from '@lumens/contratos';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { rotuloDoPapel, rotuloEvento } from '../../componentes/pauta/LinhaDoTempo';
import { diaEMes } from '../../componentes/pauta/prazos';
import { STATUS } from '../../componentes/StatusPill';
import type { StatusPauta } from '../../dados/tipos';
import { buscarApoiosPorSemana, buscarAtividade } from '../../dados/api';
import { graficoSemanal } from '../../dados/semanas';
import { metadadosDaMarca } from '../../metadados';
import estilos from '../paginas.module.css';

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

/**
 * Tom de cada tipo de evento, nas cores de status do site: azul para o que entra na pauta,
 * roxo para a meta, âmbar para a cobrança e verde para o que foi entregue. Tipo fora da lista
 * fica neutro.
 */
type Tom = 'azul' | 'roxo' | 'turquesa' | 'ambar' | 'amarelo' | 'vermelho' | 'verde';

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

/** Mudança de status ganha o tom do status novo, o mesmo dos cards e do mapa. */
const TOM_DO_STATUS: Partial<Record<StatusPauta, Tom>> = {
  juntando_apoios: 'azul',
  meta_batida: 'roxo',
  cobrando: 'ambar',
  prometido: 'turquesa',
  entregue_em_parte: 'amarelo',
  descumprida: 'vermelho',
  conquistada: 'verde',
};

/** O status para o qual a pauta foi, num evento `status_alterado` com `dados.para` conhecido. */
function statusNovo(item: AtividadeItem): StatusPauta | undefined {
  if (item.tipo !== 'status_alterado') return undefined;
  const para = item.dados.para;
  return typeof para === 'string' && para in STATUS ? (para as StatusPauta) : undefined;
}

/** "Status alterado para Conquistada" em vez de só "Status alterado"; os outros tipos, o rótulo. */
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

/** A janela de cada movimento na cor do tom do evento; sem tom, a cor neutra do filete. */
const COR_DO_TOM: Record<Tom, string> = {
  azul: 'var(--status-apoios)',
  roxo: 'var(--status-meta)',
  turquesa: 'var(--status-prometido)',
  ambar: 'var(--status-cobrando)',
  amarelo: 'var(--status-parcial)',
  vermelho: 'var(--status-descumprida)',
  verde: 'var(--status-conquistada)',
};

const linkDaPagina = (pagina: number) =>
  pagina === 1 ? '/atividade' : `/atividade?pagina=${String(pagina)}`;

export default async function PaginaAtividade({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string | string[] }>;
}) {
  const pagina = paginaDaUrl((await searchParams).pagina);
  // Erro da API sobe e cai no `error.tsx`. A API já manda do mais novo para o mais antigo e só
  // eventos públicos de pautas públicas (v_atividade).
  const [{ itens, proximo }, semanas] = await Promise.all([
    buscarAtividade(pagina),
    buscarApoiosPorSemana(),
  ]);
  const grafico = graficoSemanal(semanas);
  return (
    <main className={estilos.pagina}>
      <h1 className={estilos.titulo}>Atividade</h1>
      <p className={estilos.intro}>
        O que aconteceu nas pautas, da ação mais recente para a mais antiga.
      </p>
      <h2 className={estilos.subtitulo}>Apoios por semana</h2>
      {grafico.estado !== 'vazio' && (
        <ol className={estilos.colunas} aria-label="Apoios por semana">
          {grafico.colunas.map((coluna, i) => (
            <li
              key={coluna.semana}
              style={{ '--f': (coluna.altura / 100).toFixed(3), '--i': i } as CSSProperties}
            >
              <b>{coluna.apoios}</b>
              <i aria-hidden="true" />
              <small>{coluna.rotulo}</small>
            </li>
          ))}
        </ol>
      )}
      <p className={estilos.resumo}>{grafico.resumo}</p>
      <h2 className={estilos.subtitulo}>Movimentos</h2>
      {itens.length === 0 ? (
        <div role="status" className={estilos.vazio}>
          <p>{pagina === 1 ? 'Ainda não tem atividade.' : 'Esta página não tem atividade.'}</p>
          {pagina > 1 && (
            <div className={estilos.paginacao}>
              <Link href={linkDaPagina(1)}>Ver a atividade mais recente</Link>
            </div>
          )}
        </div>
      ) : (
        <ol className={estilos.tempo}>
          {/* Eventos iguais seguidos da mesma pauta viram uma linha (SCRUM-355); só vizinhos da página. */}
          {agruparEventosIguais(
            itens,
            (item) => item.criado_em,
            (item) => item.pauta_slug,
          ).map(({ evento: item, quantidade }, i) => {
            const tom = tomDoEvento(item);
            return (
              <li key={`${String(pagina)}-${String(i)}`}>
                <i
                  className={estilos.marco}
                  style={tom ? ({ '--c': COR_DO_TOM[tom] } as CSSProperties) : undefined}
                  aria-hidden="true"
                />
                <time dateTime={item.criado_em}>{diaEMes(item.criado_em)}</time>
                <strong>{textoDoEvento(item, quantidade)}</strong>
                <p>
                  <Link href={`/p/${item.pauta_slug}`}>{item.pauta_titulo}</Link>
                </p>
              </li>
            );
          })}
        </ol>
      )}
      {/* Página além do fim já oferece a volta no estado vazio; aqui não repete. */}
      {((pagina > 1 && itens.length > 0) || proximo !== null) && (
        <nav aria-label="Páginas da atividade" className={estilos.paginacao}>
          {pagina > 1 ? (
            <Link href={linkDaPagina(pagina - 1)} rel="prev">
              ← Mais recentes
            </Link>
          ) : (
            <span />
          )}
          {proximo !== null && (
            <Link href={linkDaPagina(pagina + 1)} rel="next">
              Mais antigas →
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
