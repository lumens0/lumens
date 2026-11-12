# Plano de testes — SCRUM-267: Canal do Telegram como reserva do bot

Linguagem/framework: TypeScript, Vitest, `app.inject` do Fastify, `fetch` falso para a Bot API
Exemplos do repo usados como base: `apps/backend/src/bot/webhook/webhook.test.ts` e
`apps/backend/src/bot/sim/sim.test.ts`
Oráculo: a [Bot API](https://core.telegram.org/bots/api) (formatos do `Update`, limites de 4096
caracteres e de 64 bytes, códigos 403/429) e a decisão
[SCRUM-267](../../decisoes/SCRUM-267-canal-telegram.md).

## Casos — entrada (`bot/telegram/update.test.ts`, `routes.test.ts`, `polling.test.ts`)

- [principal] **texto** vira texto, com o chat, o `update_id` e a data.
- [comando] **`/start`** sem payload abre o menu; `nova`, `apoiar_<slug>` e `ajudar_<slug>` viram o
  comando do link do WhatsApp; payload desconhecido abre o menu.
- [botão] **`callback_query`** vira o texto do `data` e é respondido com `answerCallbackQuery`;
  resposta rápida de aviso não entra na conversa.
- [mídia] **foto** usa o `file_id` da maior resolução, e a legenda não vira texto; **documento**
  leva o tipo.
- [negativo] **grupo, canal, mensagem de bot, edição** são ignorados.
- [dedup] **mesmo `update_id`** é duplicado; não colide com um wamid de mesmo texto.
- [segurança] **webhook sem o segredo ou com o segredo errado** → 401 e nada na fila; segredo certo
  → 200 e enfileira uma vez, mesmo reenviado.
- [falha] **fila fora** → 500 no webhook; no polling, o offset não avança e o update volta.

## Casos — identidade e canal

`bot/telegram/update.test.ts`, `packages/dominio/src/estudante/verificacao.test.ts`,
`bot/conversation/verificacao.test.ts`, `config/env.test.ts`:

- [principal] **a chave é o HMAC de `tg:<chat_id>`**, que não colide com o `hashPhone` de um
  telefone de mesmos dígitos; o chat id vai cifrado no `phoneCifrado`.
- [mescla] **e-mail de outra identidade, e esta sem cadastro:** o cadastro passa para esta, com o
  mesmo id, curso e `verificado_em`; o apoio fica, e a pessoa não apoia a mesma pauta de novo.
- [negativo] **e-mail de outra identidade, as duas com cadastro:** `email_em_uso`, nada muda.
- [negativo] **código errado** para o e-mail de outra identidade: nada muda.
- [canal] **`CANAL_BOT`** vazio é o WhatsApp (as `META_*` obrigatórias); `telegram` exige o token
  e, em `webhook`, o segredo; valor desconhecido é recusado.

## Casos — saída (`bot/telegram/sender.test.ts`, `formatacao.test.ts`, `api.test.ts`)

- [principal] **texto** vira um `sendMessage` sem `parse_mode`; `*negrito*` vira `entities`.
- [botões] **botões e lista** viram um botão inline por linha, `callback_data` = id; as descrições
  da lista vão no texto.
- [limite] **texto longo** é dividido, sem partir emoji, com o teclado só na última parte; id acima
  de 64 bytes lança; os ids que a conversa usa cabem.
- [falha] **403** descarta o resto sem lançar; **429** espera o `retry_after`; **5xx e rede** lançam
  para o retry.
- [segurança] **o token não aparece** na mensagem de erro, nem em falha de rede.

## Casos — avisos (`bot/telegram/avisos.test.ts`)

- [principal] **os seis modelos** do catálogo saem com o texto preenchido, o rodapé e os botões.
- [entrega] **`sendMessage` aceito** vale como entregue.
- [falha] **403** e **400** são falha permanente do disparo, sem parar o lote; **429 longo** e
  **rede** param o lote.
- [ritmo] **sem rajada**: intervalo entre envios e 1 s por chat.
- [lote] **com `CANAL_BOT=telegram`** o lote manda para o chat id, sem a cota da Meta, e o envio
  vale como entrega; 403 tira só aquele disparo da fila (`bot/envio/worker.test.ts`).

## Casos — mídia (`fotos/telegram-midia.test.ts`)

- [principal] **`getFile` e download**; o tipo vem da extensão; PDF como `application/pdf`.
- [limite] **acima de 20 MB** recusado sem baixar, pelo `file_size` ou pelo "file is too big".

## Casos — simulador (`bot/sim/telegram.test.ts`, `sim.test.ts`)

- [contrato] **cada construtor** (texto, `/start` com e sem payload, `callback_query`, foto,
  documento) passa no `updateSchema` real do bot.
- [dedup] **`update_id` novo** a cada chamada.
- [envio] **`sendTelegram`** manda o header `X-Telegram-Bot-Api-Secret-Token` e o update como JSON,
  sem a assinatura da Meta.
- [fixtures] **os `telegram-*.json`** passam no `updateSchema`.
- [regressão] **canal Meta** sem mudança: os testes e as fixtures da Meta continuam iguais.

## Lacunas conhecidas

- Nenhum teste conversa com o Telegram de verdade; a API é sempre um `fetch` falso.
- O `setWebhook` não é testado: o back-end não o chama.
- O teste do simulador valida o formato pelo `updateSchema`, que descarta campos que não conhece
  (o `first_name` do remetente, por exemplo): o que ele garante é só o que o bot lê.
- A montagem do `main.ts` por `CANAL_BOT` não tem teste automatizado: foi conferida subindo o
  back-end nos dois modos.
