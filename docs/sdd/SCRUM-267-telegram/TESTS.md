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

## Casos — identidade

`bot/telegram/update.test.ts`, `bot/conversation/verificacao.test.ts`,
`packages/dominio/src/estudante/chat-telegram.test.ts`:

- [principal] **contato próprio** (`contact.user_id` = `from.id`) liga o chat ao telefone, pelo
  mesmo `hashPhone` do WhatsApp; `+5582…` e `5582…` dão o mesmo telefone, guardado só como HMAC e
  cifra.
- [negativo] **contato de outra pessoa** (`contact.user_id` ≠ `from.id`) ou **sem `user_id`** é
  recusado, nada é gravado e o pedido se repete; número ilegível também.
- [regra] **mesmo telefone nos dois canais** é o mesmo estudante: o job do Telegram tem o mesmo
  `phoneHmac` do WhatsApp, e a verificação feita no WhatsApp vale no Telegram.
- [pedido] **chat sem contato** (texto, `/start`, botão, foto, documento) recebe o pedido do
  contato, e nada vai para a conversa.
- [pendente] **o link do site que chegou antes do contato** roda depois dele, e o comando fica
  cifrado; sem nada guardado, o contato abre o menu.
- [chat] **um telefone, um chat**; "sair" apaga o chat (`privacidade.test.ts`); a limpeza apaga só
  chat sem contato parado há mais de um dia.

## Casos — banco (`packages/db/src/schema.test.ts`, `migracao-chat-telegram.test.ts`)

- [constraint] **`chat_telegram`**: telefone pela metade (HMAC sem cifra) é recusado; o mesmo
  telefone em dois chats é recusado.
- [migração] **a 0014 com dados existentes** não reescreve estudantes nem disparos; o canal dos
  disparos antigos fica nulo.
- [rotação] **a rotação da cifra** recifra os campos cifrados de `chat_telegram`
  (`apps/backend/src/cripto/rotacao.test.ts`).

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
- [falha] **403** é falha permanente do disparo, sem parar o canal; **429 longo** e **rede** param
  o canal neste lote.
- [ritmo] **sem rajada**: intervalo entre envios e 1 s por chat.
- [chat] **403 apaga o chat**, e o próximo aviso da pessoa vai pelo WhatsApp; 400 não apaga
  (`bot/envio/worker.test.ts`).
- [cota] **quem tem chat sai pelo Telegram** sem ocupar vaga da Meta; o canal gravado em
  `disparo.canal` mantém a conta das 24h certa quando a pessoa liga ou perde o chat
  (`packages/dominio/src/avisos/fila.test.ts`).

## Casos — mídia (`fotos/telegram-midia.test.ts`)

- [principal] **`getFile` e download**; o tipo vem da extensão; PDF como `application/pdf`.
- [limite] **acima de 20 MB** recusado sem baixar, pelo `file_size` ou pelo "file is too big".

## Casos — simulador (`bot/sim/telegram.test.ts`, `sim.test.ts`)

- [contrato] **cada construtor** (texto, `/start` com e sem payload, `callback_query`, foto,
  documento, contato próprio e de outra pessoa) passa no `updateSchema` real do bot.
- [dedup] **`update_id` novo** a cada chamada.
- [envio] **`sendTelegram`** manda o header `X-Telegram-Bot-Api-Secret-Token` e o update como JSON,
  sem a assinatura da Meta.
- [fixtures] **os `telegram-*.json`** passam no `updateSchema`; no `message.contact` já validado,
  o `telegram-contato-alheio` tem `contact.user_id` ≠ `from.id`, e o `telegram-contato`, igual.
- [regressão] **canal Meta** sem mudança: os testes e as fixtures da Meta continuam iguais.

## Lacunas conhecidas

- Nenhum teste conversa com o Telegram de verdade; a API é sempre um `fetch` falso.
- O `setWebhook` não é testado: o back-end não o chama.
- O teste do simulador valida o formato pelo `updateSchema`, que descarta campos que não conhece
  (o `first_name` do contato, por exemplo): o que ele garante é só o que o bot lê.
- O nono dígito (wa_id antigo sem ele contra o número inteiro do Telegram) não tem teste: é
  limitação aceita, sem tratamento no código.
