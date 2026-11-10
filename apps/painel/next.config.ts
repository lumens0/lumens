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
};

export default nextConfig;
