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

const ROXO = '#5a22c8';
const CINZA = '#5b4e75';

export async function respostaDoCard(request: Request, slug: string, formato: Formato) {
  const pauta = await buscarPauta(slug);
  // Não existe, em curadoria ou recusada: 404 sem corpo, e o bot cai no fallback do link.
  if (!pauta || FORA_DO_SITE.has(pauta.status)) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const endereco = `${new URL(request.url).host}/p/${pauta.slug}`;
  const card = formato === 'story' ? cardStory(pauta, endereco) : cardOg(pauta);
  return new ImageResponse(card, {
    ...TAMANHO[formato],
    headers: { 'Cache-Control': CACHE_CONTROL },
  });
}

function cardStory(pauta: PautaDetalhe, endereco: string) {
  const titulo = tituloDoCard(pauta.titulo);
  return (
    <div style={{ ...fundo, justifyContent: 'space-between', padding: '120px 90px' }}>
      <Logo tamanho={56} />
      <div style={{ ...caixa, gap: 48, padding: 72, borderRadius: 48 }}>
        <div style={{ display: 'flex', fontSize: 38, color: CINZA }}>
          {pauta.bloco_nome ?? 'Todo o campus'}
        </div>
        <div style={{ ...estiloTitulo, fontSize: fonteDoTitulo(titulo) }}>{titulo}</div>
        <div style={{ display: 'flex' }}>
          <Status pauta={pauta} fonte={38} />
        </div>
        <Apoios pauta={pauta} numero={120} legenda={44} barra={36} />
      </div>
      <div
        style={{ display: 'flex', flexShrink: 0, flexDirection: 'column', gap: 12, fontSize: 40 }}
      >
        <span style={{ fontWeight: 700 }}>
          {aceitaApoio(pauta.status) ? 'Apoie também:' : 'Veja a pauta:'}
        </span>
        <span style={{ color: ROXO }}>{endereco}</span>
      </div>
    </div>
  );
}

/**
 * Prévia do link: sem endereço nem chamada (o WhatsApp já mostra o link ao lado), e com título e
 * número grandes, porque a miniatura aparece pequena na conversa.
 */
function cardOg(pauta: PautaDetalhe) {
  const titulo = tituloDoCard(pauta.titulo);
  return (
    <div style={{ ...fundo, gap: 24, padding: '40px 56px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Logo tamanho={44} />
        <Status pauta={pauta} fonte={30} />
      </div>
      <div style={{ ...caixa, flexGrow: 1, gap: 28, padding: '40px 48px', borderRadius: 36 }}>
        <div style={{ display: 'flex', fontSize: 30, color: CINZA }}>
          {tituloDoCard(pauta.bloco_nome ?? 'Todo o campus', LIMITE_BLOCO_OG)}
        </div>
        <div
          style={{
            ...estiloTitulo,
            flexGrow: 1,
            fontSize: Math.round(fonteDoTitulo(titulo) * 0.7),
          }}
        >
          {titulo}
        </div>
        <Apoios pauta={pauta} numero={84} legenda={36} barra={24} />
      </div>
    </div>
  );
}

const fundo = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: '#e7e1f2',
  color: '#1e1433',
} as const;

const caixa = { display: 'flex', flexDirection: 'column', background: '#fff' } as const;

const estiloTitulo = { display: 'flex', fontWeight: 700, lineHeight: 1.1 } as const;

function Logo({ tamanho }: { tamanho: number }) {
  return (
    <div
      style={{ display: 'flex', flexShrink: 0, fontSize: tamanho, fontWeight: 700, color: ROXO }}
    >
      Lumens
    </div>
  );
}

function Status({ pauta, fonte }: { pauta: PautaDetalhe; fonte: number }) {
  const status = STATUS[pauta.status];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: Math.round(fonte * 0.5),
        padding: `${String(Math.round(fonte * 0.37))}px ${String(Math.round(fonte * 0.84))}px`,
        borderRadius: 999,
        fontSize: fonte,
        background: '#FFFEFB',
        color: '#1C1917',
      }}
    >
      <div
        style={{
          width: Math.round(fonte * 0.6),
          height: Math.round(fonte * 0.6),
          borderRadius: Math.round(fonte * 0.12),
          background: status.ponto,
        }}
      />
      {status.rotulo}
    </div>
  );
}

function Apoios({
  pauta,
  numero,
  legenda,
  barra,
}: {
  pauta: PautaDetalhe;
  numero: number;
  legenda: number;
  barra: number;
}) {
  const progresso = percentual(pauta.apoios, pauta.meta);
  return (
    <div
      style={{
        display: 'flex',
        flexShrink: 0,
        flexDirection: 'column',
        gap: Math.round((barra * 2) / 3),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
        <span style={{ fontSize: numero, fontWeight: 700 }}>{formatarNumero(pauta.apoios)}</span>
        <span style={{ fontSize: legenda, color: CINZA }}>
          {`de ${formatarNumero(pauta.meta)} apoios`}
        </span>
      </div>
      <div
        style={{ display: 'flex', height: barra, borderRadius: barra / 2, background: '#ede7f7' }}
      >
        <div
          style={{
            display: 'flex',
            width: `${String(progresso)}%`,
            height: '100%',
            borderRadius: barra / 2,
            background: '#7b3fe4',
          }}
        />
      </div>
    </div>
  );
}
