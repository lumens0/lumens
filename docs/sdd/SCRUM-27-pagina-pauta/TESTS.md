# Testes: SCRUM-27 — Página da pauta

Vitest com `renderToStaticMarkup`, sem rede.

| Arquivo                            | Caso                                                    | Oráculo                                          |
| ---------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| `componentes/pauta/pauta.test.tsx` | Cabeçalho com bloco, categoria, status e owners         | `Owner · <curso>` no HTML                        |
|                                    | Pauta sem bloco                                         | só a categoria no contexto                       |
|                                    | "Apoiar" com o slug; some em pauta conquistada          | `href` do wa.me                                  |
|                                    | Relato com e sem curso, sem autor                       | texto presente, sem `null`                       |
|                                    | Sem URL de foto não há `<img>`                          | `urlFoto` devolve `null`                         |
|                                    | Com URL de foto, `alt` vem do relato                    | `alt="Foto do relato: ..."`                      |
|                                    | `alt` longo é cortado                                   | termina em `…`                                   |
|                                    | Linha do tempo preserva a ordem da API e usa Maceió     | ordem dos rótulos; `09:00` para `12:00Z`         |
|                                    | Tipo fora do catálogo                                   | texto legível                                    |
|                                    | Estados vazios                                          | mensagens de vazio                               |
|                                    | Anti-vazamento: telefone, e-mail e `estudante_id` extra | HTML sem `@`, sem padrão de telefone             |
| `dados/api.test.ts`                | 200, 404, 400, 500 e variável ausente                   | objeto, `null`, `null`, erro, erro com o nome    |
| `app/p/[slug]/page.test.tsx`       | Página e metadados com a pauta                          | título no HTML e em `title`                      |
|                                    | `null` da API e status fora do site                     | `notFound()` chamado (mock de `next/navigation`) |

## Verificação do HTTP 404

Build de produção contra uma API falsa (servidor `node:http` descartável na porta 4599:
`/pautas/existe` → 200 com um `PautaDetalhe` válido; qualquer outra rota → 404
`{"erro":"Pauta não encontrada."}`).

```sh
LUMENS_API_URL=http://localhost:4599 pnpm --filter @lumens/site build
LUMENS_API_URL=http://localhost:4599 npx next start -p 4600   # em apps/site
curl -s -o /dev/null -w '%{http_code}' http://localhost:4600/p/existe        # 200
curl -s -o /dev/null -w '%{http_code}' http://localhost:4600/p/em-curadoria  # 404
```

Resultado (09/11/2026): `/p/existe` → `200` (HTML com o título da pauta); `/p/em-curadoria` →
`404` (página amigável do `not-found.tsx`).

## Lacunas conhecidas

- Sem teste de ponta a ponta contra a API real: fazer à mão com `docker compose up`, seed e
  `curl -I /p/mais-arvores-no-campus` (deve dar 404).
- A legibilidade em 360 px foi verificada só no CSS, não em navegador.
