# SCRUM-294 · Dívidas técnicas pequenas

Dívida · 2026-11-18
**Situação:** dois itens resolvidos, um aceito como desvio.

## 1. Paginação por offset em /atividade: desvio aceito

`GET /atividade` pagina por `OFFSET` sobre `v_atividade`. Se um evento chega entre duas páginas, o
item da borda se repete na página seguinte (o feed é do mais novo para o mais antigo, então a
página nova empurra os antigos para baixo). Não some nenhum item: o desempate
(`pauta_slug`, `tipo`, `dados`) deixa a ordem estável.

**Decisão:** aceitar. O custo de resolver é maior que o dano: a view não expõe um id do evento, então
o cursor `(criado_em, id)` exige migração da view, campo novo no contrato e mudança na paginação do
site. O dano é um cartão repetido de vez em quando num feed que ninguém lê de ponta a ponta. Voltar
a olhar quando o feed tiver volume que o torne frequente.

## 2. Lista de status sem apoio duplicada: resolvido

A lista mora agora só em `@lumens/contratos` (`STATUS_SEM_APOIO`). O domínio (`SEM_APOIO` em
`packages/dominio/src/pauta/apoio.ts`) e o site (`apps/site/src/dados/pautas-publicas.ts`) montam o
conjunto a partir dela. O teste que lia o fonte do domínio por expressão regular virou uma
comparação direta com a lista única.

## 3. Tempo da API sem teste: já coberto

O teste "responde /pautas/:slug em menos de 300 ms" (`apps/backend/src/api/api.test.ts`) já existe
e roda no CI com o seed em memória. Nada a acrescentar: um limite mais apertado ou mais rotas num
banco em memória só criariam teste instável.
