import type { AtividadeItem } from '@lumens/contratos';
import type { Metadata } from 'next';
import Link from 'next/link';
import componentes from '../../componentes/componentes.module.css';
import { formatarData, rotuloEvento } from '../../componentes/pauta/LinhaDoTempo';
import { STATUS } from '../../componentes/StatusPill';
import type { StatusPauta } from '../../dados/tipos';
import { buscarAtividade } from '../../dados/api';
import { metadadosDaMarca } from '../../metadados';
import { nomeDoCanal } from '../../whatsapp';
import estilos from '../page.module.css';

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
 * turquesa para a meta, âmbar para a cobrança e verde para o que foi entregue. Tipo fora da lista
 * fica neutro.
 */
type Tom = 'azul' | 'turquesa' | 'ambar' | 'vermelho' | 'verde';

const TOM: Record<string, Tom> = {
  pauta_aprovada: 'azul',
  relato_aprovado: 'azul',
  caminho_aberto: 'azul',
  proposta_publicada: 'azul',
  owner_entrou: 'azul',
  meta_batida: 'turquesa',
  protocolo_registrado: 'ambar',
  promessa_registrada: 'ambar',
  conferencia_aberta: 'ambar',
  resposta_oficial_recebida: 'verde',
  proposta_executada: 'verde',
  conferencia_apurada: 'verde',
};

/** Mudança de status ganha o tom do status novo, o mesmo dos cards e do mapa. */
const TOM_DO_STATUS: Partial<Record<StatusPauta, Tom>> = {
  juntando_apoios: 'azul',
  meta_batida: 'turquesa',
  cobrando: 'ambar',
  prometido: 'ambar',
  entregue_em_parte: 'ambar',
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
function textoDoEvento(item: AtividadeItem): string {
  const novo = statusNovo(item);
  return novo ? `${rotuloEvento(item.tipo)} para ${STATUS[novo].rotulo}` : rotuloEvento(item.tipo);
}

function tomDoEvento(item: AtividadeItem): Tom | undefined {
  const novo = statusNovo(item);
  return novo ? TOM_DO_STATUS[novo] : TOM[item.tipo];
}

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
  const { itens, proximo } = await buscarAtividade(pagina);
  return (
    <main className={estilos.pagina}>
      <div className={[estilos.faixa, 'noite'].join(' ')}>
        <p className={estilos.sobretitulo}>Atividade · o que mudou nas pautas</p>
        <h1 className={estilos.titulo}>Acontecendo no campus</h1>
        <p className={estilos.subtitulo}>
          Cada linha vem de uma ação no {nomeDoCanal()} ou de uma resposta oficial. A mais recente
          fica em cima.
        </p>
      </div>
      {itens.length === 0 ? (
        <div role="status" className={componentes.estado}>
          <p className={componentes.estadoTitulo}>
            {pagina === 1 ? 'Ainda não tem atividade.' : 'Esta página não tem atividade.'}
          </p>
          {pagina > 1 && (
            <div className={componentes.acoes}>
              <Link href={linkDaPagina(1)} className={componentes.botaoSecundario}>
                Ver a atividade mais recente
              </Link>
            </div>
          )}
        </div>
      ) : (
        <ol className={estilos.registro}>
          {itens.map((item, i) => (
            <li
              key={`${String(pagina)}-${String(i)}`}
              className={estilos.evento}
              data-tom={tomDoEvento(item)}
            >
              <span className={estilos.icone} aria-hidden="true" />
              <div>
                <Link href={`/p/${item.pauta_slug}`} className={estilos.eventoPauta}>
                  {item.pauta_titulo}
                </Link>
                <p className={estilos.eventoTexto}>{textoDoEvento(item)}</p>
              </div>
              <time dateTime={item.criado_em} className={estilos.quando}>
                {formatarData(item.criado_em)}
              </time>
            </li>
          ))}
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
