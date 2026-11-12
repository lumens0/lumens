# SCRUM-267 — Canal do Telegram como reserva do bot

> Registro do que foi especificado, planejado e entregue — a contraparte documental do código.

|                            |                                   |
| -------------------------- | --------------------------------- |
| **Ticket**                 | SCRUM-267                         |
| **Dev**                    | @guilhermek32                     |
| **Branch**                 | `feat/telegram-bot`               |
| **Commit no arquivamento** | `a4d5706` (mais mudanças locais)  |
| **Fase alcançada**         | IMPLEMENTAÇÃO, aguardando revisão |

## Documentos

| Arquivo                | O que contém                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| [`SPEC.md`](SPEC.md)   | O que foi especificado: comportamento, critérios de aceitação, o que ficou fora de escopo. |
| [`PLAN.md`](PLAN.md)   | Como foi planejado: entrada, saída, identidade, mídia e configuração.                      |
| [`TESTS.md`](TESTS.md) | Estratégia de testes: casos, oráculo de cada um, lacunas conhecidas.                       |

Decisão: [SCRUM-267](../../decisoes/SCRUM-267-canal-telegram.md).

## Aprovação

Pendente.

## Entrega

- [x] Webhook `POST /telegram/webhook` com o `X-Telegram-Bot-Api-Secret-Token` (401 sem ele) e
      long polling para dev, gerando o mesmo job da fila.
- [x] Respostas como `sendMessage`, com listas e botões em teclado inline e `*negrito*` em
      `entities`, sem `parse_mode`.
- [x] Avisos pelo Telegram, fora do limite da Meta; aceito vale como entregue; 403 é falha
      permanente e apaga o chat, e os próximos avisos da pessoa voltam ao WhatsApp.
- [x] Foto e documento pelo `getFile`.
- [x] Canal ligado só com `TELEGRAM_BOT_TOKEN`; as `META_*` ficam opcionais com ele.
- [x] `pnpm sim --canal telegram`, com fixtures `telegram-*.json`.
- [x] Decisão em `docs/decisoes/` e este SDD.
- [x] **Identidade pelo telefone:** o chat sem telefone recebe o pedido do contato (botão
      `request_contact`); o contato da própria conta liga o chat ao telefone pelo mesmo `hashPhone`
      do WhatsApp; o cartão de outra pessoa é recusado; o comando que chegou antes do contato fica
      guardado e roda depois. Tabela `chat_telegram` e coluna `disparo.canal` na migração 0014
      (reescrita: o commit `a4d5706` usava o chat id como chave e um cadastro por canal,
      `estudante.canal`, que saiu). Detalhes no [PLAN](PLAN.md#identidade).
- [ ] Antes do merge: conciliar `bot/worker.ts`, `main.ts` e `config/env.ts` com o canal do
      Evolution, se ele entrar primeiro.

## Como rodar local

1. **Crie um bot de teste** no [@BotFather](https://t.me/BotFather) (`/newbot`) e copie o token.
   Use um bot só seu: o modo polling chama `deleteWebhook`, e com o token de um bot que tenha
   webhook em produção ele derruba esse webhook.
2. **No `.env` da raiz** (o resto como no [rodar local](../../desenvolvimento/rodar-local.md)):

   ```sh
   TELEGRAM_BOT_TOKEN=<token do BotFather>
   TELEGRAM_MODO=polling
   ```

   As `META_*` podem ficar vazias (as quatro): o back-end sobe só com o Telegram.

3. **Banco e servidor:**

   ```sh
   pnpm db:migrate
   pnpm dev
   ```

   **Se você aplicou a versão anterior da migração 0014** (a do commit `a4d5706`, que nunca foi
   para o remoto, com `estudante.canal`), rode `pnpm db:fresh` no lugar do `pnpm db:migrate`. A
   0014 reescrita tem o mesmo timestamp no journal, e o `pnpm db:migrate` a pula sem avisar: o
   banco fica sem a `chat_telegram`. O `pnpm db:fresh` **apaga o banco local** e o recria com o
   seed.

4. **Converse** com o bot no app do Telegram. As mensagens chegam pelo polling, sem túnel. A
   primeira mensagem recebe o pedido do contato: toque no botão de compartilhar o número, e a
   conversa começa (com o comando que você mandou antes, ou o menu).

### Com o simulador

O simulador fala com a rota do webhook, que só existe em `TELEGRAM_MODO=webhook` (no polling o
`POST` dá 404). Para usá-lo, troque no `.env`:

```sh
TELEGRAM_BOT_TOKEN=<token do BotFather>   # qualquer valor liga o canal; com um falso, as respostas falham no envio
TELEGRAM_MODO=webhook
TELEGRAM_WEBHOOK_SECRET=<gere com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
```

O back-end não chama o `setWebhook`, então o bot real não passa a mandar updates para a sua
máquina. Para ver as respostas no seu Telegram, use o seu chat id em `--chat` (com um chat id
inventado, o `sendMessage` responde 400 "chat not found").

Um chat novo precisa mandar o contato antes de conversar: o que chega antes recebe o pedido do
contato, e o último texto fica guardado até ele chegar.

```sh
pnpm sim start --canal telegram                        # /start: pede o contato (guarda o menu)
pnpm sim start apoiar_bebedouro --canal telegram       # link "Apoiar" do site
pnpm sim contato 5582999990000 --canal telegram        # próprio contato: roda o comando guardado
pnpm sim contato 5582988887777 900000002 --canal telegram   # cartão de outra pessoa: recusado
pnpm sim texto 'buraco no bloco 12' --canal telegram
pnpm sim botao cat_iluminacao --canal telegram         # toque em botão inline
pnpm sim foto 'poste apagado' --canal telegram
pnpm sim documento application/pdf --canal telegram
pnpm sim texto oi --canal telegram --update-id 42      # duas vezes: a segunda é duplicada
pnpm sim texto oi --canal telegram --dry-run           # só imprime o update e o header
```

`pnpm sim --help` lista tudo. Sem `--canal`, o simulador continua mandando o formato da Meta.

## Desvios do ticket

- **Ordem das histórias:** a história previa este canal depois do Evolution, reusando as peças
  comuns. Ele veio antes; ver a decisão.

## Dívida técnica aceita

- "Apoiar" e os botões de resposta rápida dos avisos não são tratados pelo bot em nenhum dos dois
  canais.
- Slug acima de 57 caracteres não cabe no payload de 64 do `start`.
- **Nono dígito.** O wa_id que a Meta entrega para algumas contas brasileiras antigas vem sem o
  nono dígito (55 + DDD + 8 dígitos), e o Telegram manda o número inteiro. Essa pessoa vira dois
  estudantes, e o e-mail da UFAL dela é recusado no segundo canal (já está no cadastro do outro
  telefone). Nenhuma heurística foi acrescentada; ver o comentário de `normalizarTelefone` em
  `apps/backend/src/bot/telegram/contato.ts`.
- **Sem teste contra a Bot API real.** Tudo foi exercitado com fakes (`fetch` falso nos testes,
  simulador contra o back-end local).
