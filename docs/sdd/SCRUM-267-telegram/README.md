# SCRUM-267 — Canal do Telegram como reserva do bot

> Registro do que foi especificado, planejado e entregue — a contraparte documental do código.

|                            |                                   |
| -------------------------- | --------------------------------- |
| **Ticket**                 | SCRUM-267                         |
| **Dev**                    | @guilhermek32                     |
| **Branch**                 | `feat/SCRUM-267-telegram`         |
| **Commit no arquivamento** | ver o PR                          |
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
- [x] Avisos pelo Telegram, sem o limite da Meta; aceito vale como entregue; 403 é falha
      permanente.
- [x] Foto e documento pelo `getFile`.
- [x] Um canal por implantação, por `CANAL_BOT`; com `telegram`, as `META_*` são ignoradas.
- [x] `pnpm sim --canal telegram`, com fixtures `telegram-*.json`.
- [x] Decisão em `docs/decisoes/` e este SDD.
- [x] **Identidade pelo chat** (HMAC de `tg:<chat_id>`), sem pedir o telefone, e **mescla pelo
      e-mail da UFAL** para quem troca de canal (`vincularEmail`). Sem migração. Detalhes no
      [PLAN](PLAN.md#identidade).
- [ ] Antes do merge: combinar com o canal do Evolution qual entra primeiro; os dois se encontram
      em `main.ts` e `config/env.ts` (`CANAL_BOT`).

## Como rodar local

1. **Crie um bot de teste** no [@BotFather](https://t.me/BotFather) (`/newbot`) e copie o token.
   Use um bot só seu: o modo polling chama `deleteWebhook`, e com o token de um bot que tenha
   webhook em produção ele derruba esse webhook.
2. **No `.env` da raiz** (o resto como no [rodar local](../../desenvolvimento/rodar-local.md)):

   ```sh
   CANAL_BOT=telegram
   TELEGRAM_BOT_TOKEN=<token do BotFather>
   TELEGRAM_MODO=polling
   ```

   As `META_*` são ignoradas com `CANAL_BOT=telegram`.

3. **Banco e servidor:**

   ```sh
   pnpm db:migrate
   pnpm dev
   ```

   **Se você aplicou uma versão anterior desta branch** (com a migração 0014), rode `pnpm db:fresh`
   no lugar do `pnpm db:migrate`: a 0014 saiu, e o journal do banco local ainda a tem. O
   `pnpm db:fresh` **apaga o banco local** e o recria com o seed.

4. **Converse** com o bot no app do Telegram. As mensagens chegam pelo polling, sem túnel. A
   primeira mensagem abre o aviso de privacidade e o menu, como no WhatsApp.

### Com o simulador

O simulador fala com a rota do webhook, que só existe em `TELEGRAM_MODO=webhook` (no polling o
`POST` dá 404). Para usá-lo, troque no `.env`:

```sh
CANAL_BOT=telegram
TELEGRAM_BOT_TOKEN=<token do BotFather>   # qualquer valor liga o canal; com um falso, as respostas falham no envio
TELEGRAM_MODO=webhook
TELEGRAM_WEBHOOK_SECRET=<gere com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
```

O back-end não chama o `setWebhook`, então o bot real não passa a mandar updates para a sua
máquina. Para ver as respostas no seu Telegram, use o seu chat id em `--chat` (com um chat id
inventado, o `sendMessage` responde 400 "chat not found").

```sh
pnpm sim start --canal telegram                        # /start: aviso de privacidade e menu
pnpm sim start apoiar_bebedouro --canal telegram       # link "Apoiar" do site
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
- **Identidade:** o ticket pedia o contato compartilhado e o mesmo `hashPhone` nos dois canais. Na
  revisão, o time decidiu por um canal por implantação, identidade pelo chat e mescla pelo e-mail
  (ver a decisão e o [SPEC](SPEC.md#critérios-de-aceitação)).
- **`callback_data`:** a SCRUM-270 pedia um mapeamento curto para ids acima de 64 bytes; aqui um id
  assim lança. Todo id gerado hoje cabe, e um teste percorre cada gerador (ver o
  [PLAN](PLAN.md#saída)).

## Dívida técnica aceita

- "Apoiar" e os botões de resposta rápida dos avisos não são tratados pelo bot em nenhum canal.
- Slug acima de 57 caracteres não cabe no payload de 64 do `start`.
- **Troca de canal no meio de um fluxo:** a conversa em andamento fica no canal antigo e expira; o
  cadastro passa ao novo na verificação.
- **Sem teste contra a Bot API real.** Tudo foi exercitado com fakes (`fetch` falso nos testes,
  simulador contra o back-end local).
