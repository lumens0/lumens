import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import type { PautaDetalhe } from '@lumens/contratos';
import { formatarNumero, percentual } from '../../../componentes/BarraApoios';
import { STATUS } from '../../../componentes/StatusPill';
import { buscarPauta } from '../../../dados/api';
import { aceitaApoio, FORA_DO_SITE } from '../../../dados/pautas-publicas';
import { fonteDoTitulo, tituloDoCard } from './card.png/titulo';

// Modelo do card da pauta (SCRUM-52), em dois formatos: `story` (1080 × 1920, `card.png`) e `og`
// (1200 × 630, `og.png`, a prévia do link). Muda só o arranjo; as peças, os dados, o 404 e o cache
// são os mesmos. Mesma fonte de dados da página (`buscarPauta`), então os números batem com os
// dela. Só título, bloco, status e apoios: nenhum dado pessoal (nem o curso dos responsáveis).
//
// Visual do site (SCRUM-104): a noite do campus, a marca do cabeçalho, o número em âmbar e uma
// fachada cujas janelas acendem conforme os apoios chegam perto da meta.

export type Formato = 'story' | 'og';
export type Contexto = { params: Promise<{ slug: string }> };

export const TAMANHO: Record<Formato, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  og: { width: 1200, height: 630 },
};

/**
 * 5 min no navegador e na CDN, para não gerar a imagem a cada acesso. Quem precisa do número
 * do momento (o bot, logo depois de um apoio) muda a query string, que entra na chave do cache.
 */
const CACHE_CONTROL = 'public, max-age=300, s-maxage=300';

/** Bloco em uma linha só na prévia: com o título em 3 linhas, não sobra altura para a segunda. */
const LIMITE_BLOCO_OG = 55;

// As cores da faixa de noite do site (`globals.css`, `.noite`).
const NOITE = '#141936';
const NOITE_2 = '#1d2450';
const JANELA_APAGADA = '#262f66';
const TINTA = '#f5f3ff';
const TINTA_2 = '#c9cbe3';
const TINTA_3 = '#a3a7c7';
const LUZ = '#ffc23d';
const LUZ_FORTE = '#ffa41b';

/**
 * As fontes do site em TTF estático (o satori não lê woff2 nem fonte variável), geradas a partir
 * de `src/fontes/*-var.woff2`, e a marca do cabeçalho (`public/lumens-marca.svg`). Lidas uma vez
 * por instância.
 */
let recursos: ReturnType<typeof lerRecursos> | undefined;
async function lerRecursos() {
  const ler = (arquivo: string) => readFile(join(process.cwd(), arquivo));
  const [bricolage, instrument500, instrument700, marca] = await Promise.all([
    ler('src/fontes/card/bricolage-800.ttf'),
    ler('src/fontes/card/instrument-500.ttf'),
    ler('src/fontes/card/instrument-700.ttf'),
    ler('public/lumens-marca.svg'),
  ]);
  return {
    fontes: [
      { name: 'Bricolage', data: bricolage, weight: 800 as const },
      { name: 'Instrument', data: instrument500, weight: 500 as const },
      { name: 'Instrument', data: instrument700, weight: 700 as const },
    ],
    marca: `data:image/svg+xml;base64,${marca.toString('base64')}`,
  };
}

export async function respostaDoCard(request: Request, slug: string, formato: Formato) {
  const pauta = await buscarPauta(slug);
  // Não existe, em curadoria ou recusada: 404 sem corpo, e o bot cai no fallback do link.
  if (!pauta || FORA_DO_SITE.has(pauta.status)) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const endereco = `${new URL(request.url).host}/p/${pauta.slug}`;
  const { fontes, marca } = await (recursos ??= lerRecursos());
  const card = formato === 'story' ? cardStory(pauta, endereco, marca) : cardOg(pauta, marca);
  return new ImageResponse(card, {
    ...TAMANHO[formato],
    fonts: fontes,
    headers: { 'Cache-Control': CACHE_CONTROL },
  });
}

function cardStory(pauta: PautaDetalhe, endereco: string, marca: string) {
  const titulo = tituloDoCard(pauta.titulo);
  return (
    <div style={{ ...fundo, padding: '112px 96px 104px' }}>
      <Brilho tamanho={1200} x={980} y={-520} />
      <Logo tamanho={56} marca={marca} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 40, marginTop: 'auto' }}>
        <div style={{ display: 'flex', fontSize: 38, color: TINTA_3 }}>
          {pauta.bloco_nome ?? 'Todo o campus'}
        </div>
        <div style={{ ...estiloTitulo, fontSize: Math.round(fonteDoTitulo(titulo) * 1.15) }}>
          {titulo}
        </div>
        <Status pauta={pauta} fonte={38} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 44, marginTop: 88 }}>
        <Numero pauta={pauta} numero={210} legenda={48} />
        <Fachada pauta={pauta} colunas={10} linhas={3} janela={72} vao={18} />
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          marginTop: 'auto',
          paddingTop: 56,
          borderTop: `2px solid rgba(255, 255, 255, 0.12)`,
          fontSize: 40,
        }}
      >
        <span style={{ fontWeight: 700, color: TINTA }}>
          {aceitaApoio(pauta.status) ? 'Apoie também:' : 'Veja a pauta:'}
        </span>
        <span style={{ color: LUZ }}>{endereco}</span>
      </div>
    </div>
  );
}

/**
 * Prévia do link: sem endereço nem chamada (o WhatsApp já mostra o link ao lado), e com título e
 * número grandes, porque a miniatura aparece pequena na conversa.
 */
function cardOg(pauta: PautaDetalhe, marca: string) {
  const titulo = tituloDoCard(pauta.titulo);
  return (
    <div style={{ ...fundo, gap: 24, padding: '48px 64px' }}>
      <Brilho tamanho={700} x={1000} y={-300} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Logo tamanho={40} marca={marca} />
        <Status pauta={pauta} fonte={28} />
      </div>
      <div style={{ display: 'flex', fontSize: 28, color: TINTA_3, marginTop: 12 }}>
        {tituloDoCard(pauta.bloco_nome ?? 'Todo o campus', LIMITE_BLOCO_OG)}
      </div>
      <div
        style={{
          ...estiloTitulo,
          flexGrow: 1,
          fontSize: Math.round(fonteDoTitulo(titulo) * 0.72),
        }}
      >
        {titulo}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <Numero pauta={pauta} numero={96} legenda={32} />
        <Fachada pauta={pauta} colunas={10} linhas={2} janela={30} vao={10} />
      </div>
    </div>
  );
}

const fundo = {
  position: 'relative',
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: NOITE,
  backgroundImage: `linear-gradient(180deg, ${NOITE} 0%, ${NOITE_2} 100%)`,
  color: TINTA,
  fontFamily: 'Instrument',
  fontWeight: 500,
} as const;

const estiloTitulo = {
  display: 'flex',
  fontFamily: 'Bricolage',
  fontWeight: 800,
  lineHeight: 1.06,
  letterSpacing: '-0.015em',
} as const;

/** Halo âmbar no alto, como a luz que vem das janelas. */
function Brilho({ tamanho, x, y }: { tamanho: number; x: number; y: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x - tamanho / 2,
        top: y,
        width: tamanho,
        height: tamanho,
        backgroundImage:
          'radial-gradient(circle, rgba(255, 194, 61, 0.13) 0%, rgba(255, 194, 61, 0) 65%)',
      }}
    />
  );
}

/** A marca do cabeçalho do site (o círculo aceso) e o nome ao lado. */
function Logo({ tamanho, marca }: { tamanho: number; marca: string }) {
  // O SVG tem folga em volta do círculo para o halo: em 44 px, o círculo tem ~24 px.
  const lado = Math.round(tamanho * 1.15);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: Math.round(tamanho * 0.12),
        fontFamily: 'Bricolage',
        fontWeight: 800,
        fontSize: tamanho,
        letterSpacing: '-0.005em',
      }}
    >
      <img
        src={marca}
        alt=""
        width={lado}
        height={lado}
        style={{ marginLeft: -Math.round(lado * 0.2) }}
      />
      Lumens
    </div>
  );
}

function Status({ pauta, fonte }: { pauta: PautaDetalhe; fonte: number }) {
  const status = STATUS[pauta.status];
  const janela = Math.round(fonte * 0.5);
  return (
    <div
      style={{
        display: 'flex',
        alignSelf: 'flex-start',
        alignItems: 'center',
        gap: Math.round(fonte * 0.45),
        padding: `${String(Math.round(fonte * 0.32))}px ${String(Math.round(fonte * 0.7))}px`,
        borderRadius: 999,
        border: '2px solid rgba(255, 255, 255, 0.16)',
        background: 'rgba(255, 255, 255, 0.06)',
        fontSize: fonte,
        color: TINTA_2,
      }}
    >
      <div
        style={{
          width: janela,
          height: janela,
          borderRadius: Math.round(janela * 0.2),
          background: status.ponto,
          boxShadow: `0 0 ${String(janela)}px ${status.ponto}`,
        }}
      />
      {status.rotulo}
    </div>
  );
}

function Numero({
  pauta,
  numero,
  legenda,
}: {
  pauta: PautaDetalhe;
  numero: number;
  legenda: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: Math.round(legenda * 0.5) }}>
      <span
        style={{
          fontFamily: 'Bricolage',
          fontWeight: 800,
          fontSize: numero,
          lineHeight: 0.9,
          letterSpacing: '-0.02em',
          color: LUZ,
        }}
      >
        {formatarNumero(pauta.apoios)}
      </span>
      <span style={{ fontSize: legenda, color: TINTA_2 }}>
        {`de ${formatarNumero(pauta.meta)} apoios`}
      </span>
    </div>
  );
}

/**
 * O progresso como fachada: uma janela acesa a cada fração da meta, de baixo para cima e da
 * esquerda para a direita. Com algum apoio, pelo menos uma acende.
 */
export function janelasAcesas(apoios: number, meta: number, total: number): number {
  if (apoios <= 0) return 0;
  return Math.max(1, Math.min(total, Math.round((percentual(apoios, meta) / 100) * total)));
}

function Fachada({
  pauta,
  colunas,
  linhas,
  janela,
  vao,
}: {
  pauta: PautaDetalhe;
  colunas: number;
  linhas: number;
  janela: number;
  vao: number;
}) {
  const acesas = janelasAcesas(pauta.apoios, pauta.meta, colunas * linhas);
  const raio = Math.round(janela * 0.16);
  return (
    <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: vao }}>
      {Array.from({ length: linhas }, (_, linha) => (
        <div key={linha} style={{ display: 'flex', gap: vao }}>
          {Array.from({ length: colunas }, (_, coluna) => {
            const acesa = linha * colunas + coluna < acesas;
            return (
              <div
                key={coluna}
                style={{
                  width: janela,
                  height: janela,
                  borderRadius: raio,
                  background: acesa
                    ? `linear-gradient(180deg, ${LUZ} 0%, ${LUZ_FORTE} 100%)`
                    : JANELA_APAGADA,
                  boxShadow: acesa
                    ? `0 0 ${String(janela / 2)}px rgba(255, 194, 61, 0.45)`
                    : 'none',
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
