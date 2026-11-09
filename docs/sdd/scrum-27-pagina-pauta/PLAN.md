# Plano: SCRUM-27 — Página da pauta

> Aprovação: pendente.

## Abordagem

- `apps/site/src/dados/api.ts` faz a busca; `app/p/[slug]/page.tsx` só decide entre a página e o 404.
- A renderização fica em componentes pequenos em `componentes/pauta/` (`CabecalhoPauta`,
  `Relatos`, `LinhaDoTempo`, `ConteudoPauta`), testáveis com uma fixture, sem rede.
- Tipos de `@lumens/contratos` com `import type`: o site não carrega zod nem precisa de
  `transpilePackages`.

## Decisões

- **Ler a API já na 4.2a.** O plano original usava os dados de exemplo, mas eles não tinham relatos
  nem eventos. A API de leitura (SCRUM-88) já estava pronta, então a página nasce lendo dela. A 4.2b
  mantém os caminhos, a resposta oficial e a troca da home para a API.
- **Segunda barreira de status.** A API já devolve 404 para pautas fora do site; a página também
  confere `FORA_DO_SITE` (agora exportado de `dados/pautas-publicas.ts`).
- **Tipos sem cast.** O `status` do contrato (7 públicos) é subconjunto do `StatusPauta` do site
  (9), então `StatusPill` e `aceitaApoio` aceitam o valor direto.
- **Foto atrás de um ponto de extensão.** `urlFoto(chave)` devolve `null` até a T20 definir a URL
  pública das fotos. `Relatos` recebe `urlFoto` como prop opcional, o que permite testar a `<img>`.
- **Só campos conhecidos.** Os componentes leem campo a campo; nada é espalhado no HTML. Assim um
  campo a mais na resposta não aparece na página.
- **`LUMENS_API_URL` só no servidor.** Sem `NEXT_PUBLIC`; ausente, a busca lança um erro claro.

## Divergências assumidas

- O plano previa documentar a variável no README do site, que não existe; ela ficou só no
  `.env.example`.
