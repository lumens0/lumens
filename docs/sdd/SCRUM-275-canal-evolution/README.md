# SCRUM-275 — Canal de WhatsApp pela Evolution API para a demonstração

> Registro do que foi especificado, planejado e entregue — a contraparte documental do código.

|                            |                                                          |
| -------------------------- | -------------------------------------------------------- |
| **Ticket**                 | SCRUM-275                                                |
| **Dev**                    | @sthefanyblima                                           |
| **Branch**                 | `feat/SCRUM-275-canal-evolution`                         |
| **Commit no arquivamento** | — (ainda não commitado)                                  |
| **Fase alcançada**         | IMPLEMENTAÇÃO, aguardando o spike com o chip e a revisão |

## Documentos

| Arquivo                | O que contém                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| [`SPEC.md`](SPEC.md)   | O que foi especificado: comportamento, critérios de aceitação, o que ficou fora de escopo. |
| [`PLAN.md`](PLAN.md)   | Como foi planejado: abordagem, decisões e divergências assumidas.                          |
| [`TESTS.md`](TESTS.md) | Estratégia de testes: casos, oráculo de cada um, lacunas conhecidas.                       |

Decisão: [SCRUM-275](../../decisoes/SCRUM-275-canal-evolution.md). Operação:
[canal da Evolution](../../operacao/evolution.md).

## Aprovação

Pendente.

## Entrega

- [ ] Spike com o chip pareado: número real vs `@lid`, formato dos eventos, download da mídia,
      VM religada. O chip está sendo aquecido; a parte local (Docker, webhook com `Authorization`)
      já foi conferida.
- [x] Infra: serviços `evolution` e `evolution-postgres` no `docker-compose.prod.yml` (perfil
      `evolution`), imagem fixada por tag e digest, sessão em volume, sem porta pública, log do
      contêiner desligado; rota fechada no Caddy; portão no deploy; `scripts/evolution.sh`.
- [x] Entrada: `POST /webhook/evolution` com segredo em tempo constante; texto, imagem,
      encaminhada e documento viram o `IncomingMessageJob` da Meta; dedup pelo id; grupos,
      status, canais, `fromMe` e reações ignorados; `messages.update` vira status de entrega.
- [x] Respostas: `ReplySender` da Evolution, com listas e botões em menu numerado e o último menu
      guardado (cifrado) na conversa.
- [x] Avisos: `ModeloSender` da Evolution com a mensagem modelo em texto; só para quem escreveu nas
      últimas 24h; teto por lote, intervalo aleatório, "digitando…" e abertura variada; erros
      classificados como no `ErroDaMeta`.
- [x] Fotos (e o PDF da resposta oficial) pela Evolution, com os limites e a remoção de EXIF de
      sempre.
- [x] `CANAL_WHATSAPP=meta|evolution` e variáveis da Evolution no `.env.example` e no
      `.env.producao.example`.
- [x] Testes e simulador (`pnpm sim … --canal evolution`).
- [ ] Antes da demo: `NEXT_PUBLIC_WHATSAPP_BOT` na Vercel com o número do chip e deploy novo do
      site.

## Desvios do ticket

- **Documento (PDF) e status de entrega entraram:** o download é o mesmo da foto, e sem ele o owner
  não conseguiria mandar a resposta oficial (3.6) na demo. O status de entrega mantém o registro de
  quem recebeu o aviso, que a curadoria usa.
- **O `MENU_TEXT` depois de um menu numerado sai só neste canal.** Ver o PLAN.
- **Ordem invertida: o Telegram (PR #132) entrou primeiro.** Este canal foi refeito em cima dele:
  usa o `CANAL_BOT`, o `AvisoSender`, o `ErroDeEnvio` e o `canal` da fila que ele criou, e entra
  como provedor do WhatsApp (`CANAL_WHATSAPP`). Ver o PLAN.

## Dívida técnica aceita

- O formato dos eventos foi tirado do código da v2.3.7, não de payloads reais. O spike confirma;
  o que divergir muda em `src/bot/sim/evolution.ts`, nas fixtures e, se for o caso, em
  `webhook.ts`.
- Mensagem 1:1 sem número (só `@lid`) é ignorada. Se o spike mostrar que isso acontece, a decisão
  volta para a equipe.
- A entrega das respostas é "pelo menos uma vez", como no canal da Meta: se uma resposta do meio
  falhar, o retry manda de novo as anteriores.
