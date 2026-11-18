import { expect, test } from '@playwright/test';

// Limite de requisições (SCRUM-310): a API que o e2e sobe é a de produção, com o limitador. Este
// teste confere que ele está ligado; o resto do e2e (páginas, axe, varredura de privacidade) é a
// prova de que o site funciona com ele.

/** A API de leitura que o playwright.config.ts sobe para o site. */
const API = process.env.LUMENS_API_URL ?? 'http://127.0.0.1:3101';

/** O `LIMITE_DA_API` de `apps/backend/src/infra/limite.ts`. */
const LIMITE_POR_MINUTO = 600;

test('a API lida pelo site responde com o limite de produção ligado', async ({ request }) => {
  test.skip(test.info().project.name !== 'desktop', 'roda só no projeto desktop');

  const resposta = await request.get(`${API}/blocos`);

  expect(resposta.status()).toBe(200);
  expect(resposta.headers()['x-ratelimit-limit']).toBe(String(LIMITE_POR_MINUTO));
});
