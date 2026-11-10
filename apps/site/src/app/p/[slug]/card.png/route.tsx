import { ImageResponse } from 'next/og';
import { formatarNumero, percentual } from '../../../../componentes/BarraApoios';
import { STATUS } from '../../../../componentes/StatusPill';
import { buscarPauta } from '../../../../dados/api';
import { aceitaApoio, FORA_DO_SITE } from '../../../../dados/pautas-publicas';
import { fonteDoTitulo, tituloDoCard } from './titulo';

// Card da pauta em formato story, para o status e os grupos (RF-S05) e para o bot mandar como
// imagem depois do apoio (RF-B08, 2.9). Mesma fonte de dados da página (`buscarPauta`), então os
// números batem com os dela. Só título, bloco, status e apoios: nenhum dado pessoal (nem o curso
// dos responsáveis).

const LARGURA = 1080;
const ALTURA = 1920;

/**
 * 5 min no navegador e na CDN, para não gerar a imagem a cada acesso. Quem precisa do número
 * do momento (o bot, logo depois de um apoio) muda a query string, que entra na chave do cache.
 */
const CACHE_CONTROL = 'public, max-age=300, s-maxage=300';

type Contexto = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Contexto) {
  const pauta = await buscarPauta((await params).slug);
  // Não existe, em curadoria ou recusada: 404 sem corpo, e o bot cai no fallback do link.
  if (!pauta || FORA_DO_SITE.has(pauta.status)) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const status = STATUS[pauta.status];
  const progresso = percentual(pauta.apoios, pauta.meta);
  const titulo = tituloDoCard(pauta.titulo);
  const endereco = `${new URL(request.url).host}/p/${pauta.slug}`;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '120px 90px',
        background: '#e7e1f2',
        color: '#1e1433',
      }}
    >
      <div
        style={{ display: 'flex', flexShrink: 0, fontSize: 56, fontWeight: 700, color: '#5a22c8' }}
      >
        Lumens
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 48,
          padding: 72,
          borderRadius: 48,
          background: '#fff',
        }}
      >
        <div style={{ display: 'flex', fontSize: 38, color: '#5b4e75' }}>
          {pauta.bloco_nome ?? 'Todo o campus'}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: fonteDoTitulo(titulo),
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          {titulo}
        </div>
        <div style={{ display: 'flex' }}>
          <div
            style={{
              display: 'flex',
              padding: '14px 32px',
              borderRadius: 999,
              fontSize: 38,
              background: status.fundo,
              color: status.texto,
            }}
          >
            {status.rotulo}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
            <span style={{ fontSize: 120, fontWeight: 700 }}>{formatarNumero(pauta.apoios)}</span>
            <span style={{ fontSize: 44, color: '#5b4e75' }}>
              {`de ${formatarNumero(pauta.meta)} apoios`}
            </span>
          </div>
          <div style={{ display: 'flex', height: 36, borderRadius: 18, background: '#ede7f7' }}>
            <div
              style={{
                display: 'flex',
                width: `${String(progresso)}%`,
                height: '100%',
                borderRadius: 18,
                background: '#7b3fe4',
              }}
            />
          </div>
        </div>
      </div>

      <div
        style={{ display: 'flex', flexShrink: 0, flexDirection: 'column', gap: 12, fontSize: 40 }}
      >
        <span style={{ fontWeight: 700 }}>
          {aceitaApoio(pauta.status) ? 'Apoie também:' : 'Veja a pauta:'}
        </span>
        <span style={{ color: '#5a22c8' }}>{endereco}</span>
      </div>
    </div>,
    { width: LARGURA, height: ALTURA, headers: { 'Cache-Control': CACHE_CONTROL } },
  );
}
