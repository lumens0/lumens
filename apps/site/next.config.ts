import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { exigirNumeroDoBot } from './src/whatsapp';

const nextConfig: NextConfig = {
  agentRules: false,
};

/**
 * No build de produção, falta do número do bot é erro (SCRUM-43): melhor o deploy falhar do que o
 * site sair sem os botões do WhatsApp. No `next dev` e nos testes os botões só somem.
 */
export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) exigirNumeroDoBot(process.env.NEXT_PUBLIC_WHATSAPP_BOT);
  return nextConfig;
}
