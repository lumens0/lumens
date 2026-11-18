import type { NextConfig } from 'next';

// Localmente o painel lê o .env da raiz, como o backend (sem sobrescrever o que já está no
// ambiente). Na Vercel não há arquivo: as variáveis vêm do projeto do painel.
try {
  process.loadEnvFile('../../.env');
} catch {
  // sem .env da raiz: segue com o ambiente
}

const nextConfig: NextConfig = {
  agentRules: false,
  // Sem `X-Powered-By: Next.js` (SCRUM-303): a resposta não anuncia o framework.
  poweredByHeader: false,
};

export default nextConfig;
