import type { Metadata } from 'next';
import Link from 'next/link';
import componentes from '../../componentes/componentes.module.css';
import { formatarData, rotuloEvento } from '../../componentes/pauta/LinhaDoTempo';
import { buscarAtividade } from '../../dados/api';
import { metadadosDaMarca } from '../../metadados';
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

/** Eventos que são um passo conquistado: ganham o ✓ verde na lista. */
const CONQUISTA = new Set([
  'meta_batida',
  'proposta_executada',
  'resposta_oficial_recebida',
  'conferencia_apurada',
]);

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
      <p className={estilos.sobretitulo}>Atividade · o que mudou nas pautas</p>
      <h1 className={estilos.titulo}>Acontecendo no campus</h1>
      <p className={estilos.subtitulo}>
        Cada linha vem de uma ação no WhatsApp ou de uma resposta oficial. A mais recente fica em
        cima.
      </p>
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
        <ol className={estilos.lista}>
          {itens.map((item, i) => (
            <li key={`${String(pagina)}-${String(i)}`} className={estilos.evento}>
              <span
                className={CONQUISTA.has(item.tipo) ? estilos.iconeFeito : estilos.icone}
                aria-hidden="true"
              >
                {CONQUISTA.has(item.tipo) ? '✓' : '•'}
              </span>
              <div>
                <Link href={`/p/${item.pauta_slug}`} className={estilos.eventoPauta}>
                  {item.pauta_titulo}
                </Link>
                <p className={estilos.eventoTexto}>{rotuloEvento(item.tipo)}</p>
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
