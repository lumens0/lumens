# Spec: SCRUM-27 — Página da pauta

> Ticket: SCRUM-27 — 4.2a · Cabeçalho e apoios (SCRUM-45), relatos e linha do tempo (SCRUM-46),
> página 404 (SCRUM-47).
> Contexto: cada pauta pública tem um endereço próprio, `/p/<slug>`, já usado pelos cards da home.

## Comportamento principal

- A página busca `GET /pautas/:slug` na API de leitura (`LUMENS_API_URL`), com revalidação de 30 s,
  igual ao `Cache-Control` da API.
- 404 ou 400 da API → `notFound()`, que responde HTTP 404. Status `em_curadoria` ou `recusada` →
  também 404, mesmo que a API falhe em filtrar. Outros erros sobem para o `error.tsx`.
- **Cabeçalho:** bloco (quando houver) e categoria, título (`<h1>`), status, descrição,
  `Owner · <curso>` para cada curso responsável, barra de apoios e "Apoiar" pelo WhatsApp (só para
  status que aceitam apoio).
- **Relatos:** texto e curso (quando houver). Nunca o autor. Foto só quando houver URL pública, com
  `alt` tirado do texto do relato.
- **Linha do tempo:** na ordem da API, com rótulo em pt-BR por tipo e `<time dateTime>` formatado em
  pt-BR no fuso `America/Maceio`.
- **Estados vazios:** "Ainda não tem relato publicado nesta pauta." e "Ainda não tem acontecimento
  registrado."
- `<title>` = título da pauta.

## Critérios de aceitação

- [x] Owner aparece só pelo curso.
- [x] Relato aparece sem autor.
- [x] A ordem da linha do tempo é a da API.
- [ ] Foto, quando existir, tem texto alternativo. **Parcial:** as fotos não aparecem até a T20
      (SCRUM-93) definir a URL pública; o `alt` está implementado e testado só com `urlFoto` injetado.
- [x] Pauta inexistente ou fora do site responde 404, com mensagem amigável e link para a home.
- [x] Campos de identidade que viessem a mais na resposta não chegam ao HTML.
- [x] Legível em 360 px, com quebra de palavras longas. Conferido no navegador em 360 × 780 com o
      build de produção e a API falsa do TESTS.md: sem rolagem horizontal (`scrollWidth` = 360).

## Contextuais

- **Atores:** qualquer pessoa no site, sem login.
- **Casos de borda:** pauta sem bloco; relato sem curso ou sem foto; tipo de evento fora do
  catálogo; API fora do ar; slug mal formado.
- **Fora de escopo:** caminhos e "Vou ajudar", resposta oficial, home lendo a API (4.2b); Open
  Graph (4.5); URL das fotos (T20).

## Padrões aplicáveis

- Nenhum catálogo `.agent/patterns/`. Segue `apps/site/src/componentes/` e o contrato de
  `docs/arquitetura/api.md`.
