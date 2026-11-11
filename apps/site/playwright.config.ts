import { defineConfig, devices } from '@playwright/test';

/**
 * Testes ponta a ponta do site (SCRUM-28). Sobem dois servidores: a API de leitura real sobre o
 * banco com o seed (dados fixos) e o site já construído (`next build`, com a flag do "Apoiar").
 */
const API = 'http://127.0.0.1:3101';
const SITE = 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: SITE,
    // Falha guarda trace e screenshot: o CI sobe a pasta `test-results` como artefato.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'celular',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @lumens/backend api:leitura',
      url: `${API}/blocos`,
      env: { PORT: '3101' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm exec next start -p 3100 -H 127.0.0.1',
      url: SITE,
      env: { LUMENS_API_URL: API },
      reuseExistingServer: !process.env.CI,
    },
  ],
});
