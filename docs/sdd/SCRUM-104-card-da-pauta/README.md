# SCRUM-104 — [2.9] Enviar o card da pauta

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Ticket**   | [SCRUM-104](https://ic-team-pds.atlassian.net/browse/SCRUM-104) |
| **Branch**   | `feat/SCRUM-104-card-da-pauta`                                  |
| **Ref**      | RF-B08 · história 2.9 · tamanho P                               |
| **Subtasks** | SCRUM-157, SCRUM-158                                            |

## Fluxo

```
apoio registrado (ou "você já apoia") ──▶ placar ──▶ card da pauta ──▶ "quer contar o que viu?"

card = { tipo: 'imagem', url: SITE/p/<slug>/card.png?apoios=<total>, legenda: "Compartilhe…: SITE/p/<slug>" }

Telegram: sendPhoto(url, legenda) ──falhou──▶ sendMessage(legenda)   (403 / chat not found: para tudo)
log do pnpm dev e WhatsApp pela Meta (logSender): a legenda e o link da imagem, em texto
```

Código: `apps/backend/src/bot/conversation/resposta.ts` (`MensagemDeImagem`),
`apoio.ts` (`cardDaPauta`, no fim de `entrarNoApoio`) e `telegram/sender.ts` (`sendPhoto` com a
legenda como alternativa). A imagem é a rota do site `apps/site/src/app/p/[slug]/card.png`, que já
existia (formato story, 1080 × 1920).

## Critérios de aceite e onde estão cobertos

| Critério                                             | Teste                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| Depois do apoio, o card vai como imagem, com legenda | `apoio.test.ts` (apoio novo, meta batida, já apoiava); `sender.test.ts`   |
| O card mostra os números atuais                      | `cardDaPauta`: o total na query string fura o cache de 5 min do card      |
| Falha no endpoint manda só o link (SCRUM-158)        | `sender.test.ts` · card que o Telegram não baixa (400) e Telegram em 5xx  |
| Falha no card não quebra o fluxo                     | os mesmos: a resposta seguinte ("quer contar o que viu?") ainda é enviada |
| Comando do site e retomada pela verificação mandam   | `comandos-do-site.test.ts`, `verificacao.test.ts`, `roteiro-1`            |

## Decisões que vale a revisão olhar

- **O canal baixa a imagem, não o bot.** O card vai por link (`photo` = URL no Telegram), como o
  `image.link` que o ticket previa para a Meta. O bot não depende do site estar no ar para seguir
  a conversa: se o Telegram não conseguir a imagem, vai a legenda, que já tem o link.
- **Qualquer falha do card vira o link, menos destino perdido.** 400 (URL que não abre) e 5xx
  mandam a legenda em vez de devolver o job ao retry, que reenviaria as respostas anteriores.
  403 e "chat not found" param tudo, como nas outras respostas.
- **Origem do site.** `ORIGEM_SITE_PRODUCAO`, a mesma do aviso de privacidade e dos botões de
  link dos avisos. Pauta que só existe no banco local dá 404 no site e cai no link em texto.
- **Também para quem já apoiava.** Quem toca em "Apoiar" de novo recebe o placar e o card: é o
  momento de compartilhar do mesmo jeito.
- **Visual do card.** O card (e a prévia `og.png`, que usa o mesmo modelo) ganhou o visual do
  site: a noite do campus, a janela acesa da marca, o número em âmbar e uma fachada em que cada
  janela acesa é uma fração da meta (`janelasAcesas`). As fontes vão em TTF estático em
  `apps/site/src/fontes/card/`, geradas dos woff2 variáveis do site, porque o `next/og` não lê
  woff2 nem fonte variável; o `outputFileTracingIncludes` leva os arquivos para a função da Vercel.

## Fora do escopo

- **Evolution (SCRUM-275, PR #133).** Quando os dois estiverem na main, a Evolution manda a
  `MensagemDeImagem` por `/message/sendMedia` (`mediatype: image`, `media` = URL, `caption` =
  legenda), com a mesma alternativa em texto. O `menuDaResposta` dela precisa ignorar a imagem.
