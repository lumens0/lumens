# SCRUM-26 — Botões de ação pelo WhatsApp

> Registro do que foi especificado, planejado e entregue — a contraparte documental do código.

|                            |                                                |
| -------------------------- | ---------------------------------------------- |
| **Ticket**                 | SCRUM-26 (4.3), subtarefas SCRUM-43 e SCRUM-44 |
| **Dev**                    | @guilhermek32                                  |
| **Branch**                 | `feat/SCRUM-26-whatsapp`                       |
| **Commit no arquivamento** | — (ainda não commitado)                        |
| **Fase alcançada**         | IMPLEMENTAÇÃO, aguardando revisão              |

## Documentos

| Arquivo                | O que contém                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| [`SPEC.md`](SPEC.md)   | O que foi especificado: comportamento, critérios de aceitação, o que ficou fora de escopo. |
| [`PLAN.md`](PLAN.md)   | Como foi planejado: abordagem, decisões e divergências assumidas.                          |
| [`TESTS.md`](TESTS.md) | Estratégia de testes: casos, oráculo de cada um, lacunas conhecidas.                       |

## Aprovação

Pendente.

## Entrega

- [x] Helper `linkWhatsApp(comando?)` em `apps/site/src/whatsapp.ts` (SCRUM-43), com os comandos
      `comandoApoiar(slug)`, `comandoAjudar(id)` e `COMANDO_NOVA_PAUTA`.
- [x] Componente `BotaoWhatsApp` e a variante `BotaoVouAjudar`, atrás da flag
      `NEXT_PUBLIC_FLAG_VOU_AJUDAR` (SCRUM-44).
- [x] "Apoiar" no card da pauta, só para status que aceitam apoio, fora do link do título.
- [x] "Relatar um problema" (`BotaoRelatar`) na home, só com a lista não vazia, e na `ListaVazia`.
- [x] `NEXT_PUBLIC_WHATSAPP_BOT` e `NEXT_PUBLIC_FLAG_VOU_AJUDAR` documentadas no `.env.example`.
- [ ] "Apoiar" e "Vou ajudar" na página da pauta: entram com a página (SCRUM-27).

## Desvios do ticket

- **Regra de status com apoio:** lista local no site, espelhando `SEM_APOIO` do domínio. Ver o PLAN.

## Dívida técnica aceita

- A lista de status sem apoio existe em dois lugares (`packages/dominio/src/apoio.ts` e
  `apps/site/src/dados/pautas-publicas.ts`); um teste compara as duas e falha se divergirem.
- O bot ainda não interpreta `apoiar <slug>`, `ajudar <id>` nem `nova pauta` (2.7 / SCRUM-102 e
  3.5 / SCRUM-197): até lá, o link abre a conversa com o texto, mas a ação depende do bot.
