# SCRUM-27 — Página da pauta (`/p/[slug]`)

> Registro do que foi especificado, planejado e entregue — a contraparte documental do código.

|                            |                                                           |
| -------------------------- | --------------------------------------------------------- |
| **Ticket**                 | SCRUM-27 (4.2a), subtarefas SCRUM-45, SCRUM-46 e SCRUM-47 |
| **Dev**                    | @guilhermek32                                             |
| **Branch**                 | `feat/SCRUM-27-pagina-pauta`                              |
| **Commit no arquivamento** | `9117c42`                                                 |
| **Fase alcançada**         | IMPLEMENTAÇÃO, aguardando revisão                         |

## Documentos

| Arquivo                | O que contém                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| [`SPEC.md`](SPEC.md)   | O que foi especificado: comportamento, critérios de aceitação, o que ficou fora de escopo. |
| [`PLAN.md`](PLAN.md)   | Como foi planejado: abordagem, decisões e divergências assumidas.                          |
| [`TESTS.md`](TESTS.md) | Estratégia de testes: casos, oráculo de cada um, lacunas conhecidas.                       |

## Aprovação

Pendente.

## Entrega

- [x] Cliente `buscarPauta(slug)` em `apps/site/src/dados/api.ts`, lendo `GET /pautas/:slug`.
- [x] Cabeçalho com título, status, bloco, categoria, owners só pelo curso, apoios e "Apoiar"
      (SCRUM-45).
- [x] Relatos sem autor e linha do tempo com datas em pt-BR (SCRUM-46).
- [x] 404 de verdade para pauta inexistente ou fora do site, com página amigável (SCRUM-47).
- [x] `LUMENS_API_URL` documentada no `.env.example`.
- [ ] **Antes do merge:** `LUMENS_API_URL` configurada no projeto do site na Vercel (o merge no
      `main` publica em produção). Sem ela, toda `/p/<slug>` cai no `error.tsx`, inclusive pauta
      inexistente, que deveria dar 404.

## Desvios do ticket

- **A página já lê a API na 4.2a.** Os dados de exemplo não tinham relatos nem eventos, então não
  serviam para a página. Ver o PLAN.

## Dívida técnica aceita

- Foto do relato: `urlFoto(chave)` devolve `null` até a T20 (SCRUM-93) definir a URL pública. Até
  lá nenhuma `<img>` aparece.
- Ficam para a 4.2b: caminhos (com "Vou ajudar"), resposta oficial e a home lendo a API.
