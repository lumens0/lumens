import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import {
  CABECALHOS_DE_SEGURANCA,
  CACHE_DA_CDN,
  CACHE_PUBLICO,
  PAGINAS_EM_CACHE,
} from './src/cabecalhos';
import { exigirBotDoCanal } from './src/whatsapp';

const nextConfig: NextConfig = {
  agentRules: false,
  // As fontes e a marca do card da pauta são lidas do disco na hora de gerar a imagem (SCRUM-104).
  outputFileTracingIncludes: { '/p/**': ['./src/fontes/card/*.ttf', './public/lumens-marca.svg'] },
  // Cabeçalhos de segurança (SCRUM-377) e cache curto das páginas públicas (SCRUM-379).
  headers() {
    return Promise.resolve([
      { source: '/:path*', headers: CABECALHOS_DE_SEGURANCA },
      ...PAGINAS_EM_CACHE.map((source) => ({
        source,
        headers: [
          { key: 'Cache-Control', value: CACHE_PUBLICO },
          { key: 'Vercel-CDN-Cache-Control', value: CACHE_DA_CDN },
        ],
      })),
    ]);
  },
};

/**
 * No build de produção, falta do bot do canal ativo é erro (SCRUM-43): melhor o deploy falhar do
 * que o site sair sem os botões do bot. Canal desconhecido também. No `next dev` e nos testes os
 * botões só somem.
 */
export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    exigirBotDoCanal({
      canal: process.env.NEXT_PUBLIC_CANAL_BOT,
      whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_BOT,
      telegram: process.env.NEXT_PUBLIC_TELEGRAM_BOT,
    });
  }
  return nextConfig;
}
