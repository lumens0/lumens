# Simulador de webhook (Meta / WhatsApp Cloud API)

Monta payloads no formato do webhook da Meta, assina com HMAC-SHA256 usando o
mesmo `META_APP_SECRET` do `.env` da raiz (header `X-Hub-Signature-256`) e faz `POST` no bot.
Permite testar o fluxo inteiro sem celular nem conta Meta.

## Uso

```sh
pnpm sim <tipo> [args...] [opções]   # atalho da raiz para pnpm --filter @lumens/backend sim
```

| Tipo                       | O que envia                                  |
| -------------------------- | -------------------------------------------- |
| `texto <mensagem>`         | mensagem de texto                            |
| `encaminhada <mensagem>`   | texto com `context.forwarded: true`          |
| `botao <id> <titulo>`      | `interactive.button_reply`                   |
| `lista <id> <titulo>`      | `interactive.list_reply`                     |
| `imagem [legenda]`         | imagem (mídia fictícia) com legenda opcional |
| `status <delivered\|read>` | evento de status (o webhook deve ignorar)    |

| Opção             | Padrão                                           |
| ----------------- | ------------------------------------------------ |
| `--from <numero>` | `5582999990000`                                  |
| `--url <url>`     | `http://localhost:<PORT do .env>/webhook` (3001) |
| `--wamid <id>`    | aleatório (fixe para testar deduplicação)        |
| `--secret <s>`    | `META_APP_SECRET` do `.env`                      |
| `--dry-run`       | só imprime payload e assinatura, não envia       |

Rode da raiz do repositório: o script carrega o `.env` da raiz (`--env-file-if-exists`).
A saída mostra o status HTTP da resposta; o processo sai com código 1 se o
status for >= 400 ou se o envio falhar.

## Exemplos

```sh
# Relato simples
pnpm sim texto 'buraco no bloco 12' --from 5582988887777

# Mensagem encaminhada
pnpm sim encaminhada 'URGENTE: repassem para todos'

# Respostas interativas
pnpm sim botao confirmar Confirmar
pnpm sim lista cat_iluminacao 'Iluminação'

# Relato com busca de pauta parecida (2.5): menu → relato → bloco → pauta
pnpm sim texto 'oi'
pnpm sim texto '1'
pnpm sim encaminhada 'o bebedouro do bloco 18 está quebrado'
pnpm sim lista outro 'É outro problema'   # ou o id da pauta que apareceu no log: pauta:<id>

# Imagem com legenda
pnpm sim imagem 'poste apagado'

# Deduplicação: envie duas vezes com o mesmo wamid
pnpm sim texto 'oi' --wamid wamid.TESTE1
pnpm sim texto 'oi' --wamid wamid.TESTE1

# Status (deve ser ignorado pelo webhook)
pnpm sim status delivered

# Ver o payload e a assinatura sem enviar
pnpm sim texto 'oi' --dry-run

# Outro destino / segredo
pnpm sim texto 'oi' --url https://staging.exemplo/webhook --secret outro-segredo
```

## Canal Telegram (`--canal telegram`)

Com `--canal telegram`, o simulador monta `Update`s da Bot API do Telegram e faz `POST` em
`/telegram/webhook` com o header `X-Telegram-Bot-Api-Secret-Token` (o Telegram não assina o
corpo, como a Meta). Sem `--canal`, ele continua mandando o formato da Meta.

| Tipo               | O que envia                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `texto <mensagem>` | mensagem de texto                                                                             |
| `start [payload]`  | `/start`, com o payload opcional dos links do site (`nova`, `apoiar_<slug>`, `ajudar_<slug>`) |
| `botao <data>`     | toque em botão do teclado inline (`callback_query`)                                           |
| `foto [legenda]`   | foto (arquivo fictício, em três tamanhos) com legenda opcional                                |
| `documento [mime]` | documento (arquivo fictício; padrão `image/jpeg`)                                             |

| Opção             | Padrão                                                    |
| ----------------- | --------------------------------------------------------- |
| `--chat <id>`     | `900000001` (chat privado; é também o `from.id`)          |
| `--url <url>`     | `http://localhost:<PORT do .env>/telegram/webhook` (3001) |
| `--update-id <n>` | um novo a cada envio (fixe para testar deduplicação)      |
| `--secret <s>`    | `TELEGRAM_WEBHOOK_SECRET` do `.env`                       |
| `--dry-run`       | só imprime o update e o header, não envia                 |

`--from` e `--wamid` só valem no canal Meta; `--chat` e `--update-id`, só no Telegram.

A rota `/telegram/webhook` só existe com o back-end em `TELEGRAM_MODO=webhook`: no modo `polling`
ela não é registrada, e o `POST` dá 404. No `.env` da raiz:

```sh
CANAL_BOT=telegram
TELEGRAM_BOT_TOKEN=<token do @BotFather>   # qualquer valor liga o canal; com um falso, as respostas do bot falham no envio
TELEGRAM_MODO=webhook
TELEGRAM_WEBHOOK_SECRET=<letras, números, _ e ->
```

O back-end não chama o `setWebhook`: o bot real não passa a mandar updates para a sua máquina.
Para ver as respostas no seu Telegram, passe o seu chat id em `--chat`.

```sh
# /start de um chat novo: aviso de privacidade e menu
pnpm sim start --canal telegram

# Link "Apoiar" do site
pnpm sim start apoiar_bebedouro --canal telegram

# Texto, botão inline, foto e documento
pnpm sim texto 'buraco no bloco 12' --canal telegram
pnpm sim botao cat_iluminacao --canal telegram
pnpm sim foto 'poste apagado' --canal telegram
pnpm sim documento application/pdf --canal telegram

# Deduplicação: envie duas vezes com o mesmo update_id
pnpm sim texto 'oi' --canal telegram --update-id 42
pnpm sim texto 'oi' --canal telegram --update-id 42

# Ver o update e o header sem enviar
pnpm sim texto 'oi' --canal telegram --dry-run

# Outro chat / destino / segredo
pnpm sim texto 'oi' --canal telegram --chat 123456789 --url http://localhost:8080/telegram/webhook --secret outro-segredo
```

Construtores em `src/bot/sim/telegram.ts`: `buildTelegramText`, `buildTelegramStart`,
`buildTelegramCallback`, `buildTelegramPhoto`, `buildTelegramDocument`, `buildTelegramContact`
e `sendTelegram`. Fixtures em `src/bot/sim/__fixtures__/telegram-*.json`; o teste
`src/bot/sim/telegram.test.ts` confere que construtores e fixtures passam no `updateSchema` do bot.

## Uso programático

```ts
import { buildTextMessage } from './src/bot/sim/payloads';
import { sendSigned, signPayload } from './src/bot/sim/send';

const payload = buildTextMessage({ body: 'oi', from: '5582999990000', wamid: 'wamid.X' });
const { body, signature } = signPayload(payload, 'segredo'); // para injetar no Fastify
await sendSigned(payload, { url: 'http://localhost:3001/webhook', secret: 'segredo' });
```

Construtores disponíveis em `src/bot/sim/payloads.ts`: `buildTextMessage`,
`buildForwardedMessage`, `buildButtonReply`, `buildListReply`,
`buildImageMessage`, `buildStatus` e `wrapPayload` (envelope genérico).

## Fixtures

`src/bot/sim/__fixtures__/*.json` (`texto`, `encaminhada`, `botao`, `lista`, `imagem`,
`status-delivered`) são geradas de forma determinística (wamid e timestamp fixos)
e reutilizadas nos testes do webhook. Para regenerar:

```sh
pnpm --filter @lumens/backend fixtures && pnpm format
```

O teste `src/bot/sim/sim.test.ts` garante que as fixtures continuam iguais à saída
dos construtores.
