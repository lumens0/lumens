# Plano: SCRUM-267 — Canal do Telegram como reserva do bot

> Aprovação: pendente.

## Abordagem

O Telegram entra como um adaptador nas duas pontas da conversa, sem tocar nela: na entrada, o
`Update` vira o mesmo job da fila do webhook da Meta; na saída, as `Resposta`s viram `sendMessage`.
O código fica em `apps/backend/src/bot/telegram/`.

## Entrada

```
Telegram ──▶ POST /telegram/webhook (routes.ts) ─┐
             header X-Telegram-Bot-Api-Secret-Token
Telegram ◀── getUpdates (polling.ts, só dev) ────┤
                                                 ▼
                         processarUpdate (update.ts)
            zod (updateSchema) ─▶ mensagemDoUpdate ─▶ jobDoTelegram ─▶ dedup + fila
            só o que o bot usa     pura                HMAC e cifra       enfileirarUmaVez
```

- **`routes.ts`:** compara o header com o `TELEGRAM_WEBHOOK_SECRET` em tempo constante; errado ou
  ausente → 401 e nada na fila. Dedup e enfileiramento antes do 200; se falharem, 500 e o Telegram
  reenvia. Update fora do formato → 200 (reenviar não o conserta).
- **`polling.ts`:** `deleteWebhook`, depois `getUpdates` em laço. O offset só avança depois que o
  update foi enfileirado; erro espera com backoff de 1 s a 30 s.
- **`update.ts`:** só chat privado; mensagem de bot é ignorada. Foto vira `image` com o `file_id` da
  maior resolução; documento vira `document`; o `callback_query` vira texto do `data` e é
  respondido com `answerCallbackQuery` (melhor esforço). O dedup é o HMAC de `tg:<update_id>`, na
  mesma tabela do wamid.
- **Contato compartilhado:** o `message.contact` com `user_id` igual ao `from.id` dá o telefone,
  que passa pelo `hashPhone` do WhatsApp; com `user_id` diferente ou ausente, é recusado (ver
  [Identidade](#identidade)).

## Identidade

Decidido na [SCRUM-267](../../decisoes/SCRUM-267-canal-telegram.md): **um estudante por telefone**,
nos dois canais. O update do Telegram só traz o chat id; o telefone chega uma vez, quando a pessoa
compartilha o próprio contato.

```
update ─▶ chat_telegram[HMAC de tg:<chat_id>]
            ├─ com telefone ─▶ job da conversa com o hashPhone do telefone (o mesmo do WhatsApp)
            ├─ sem telefone ─▶ pede o contato (teclado request_contact); um texto fica guardado
            └─ contato ──────▶ próprio: liga o chat ao telefone, tira o teclado e roda o texto
                               guardado (ou `menu`); de outra pessoa: recusa e pede de novo
```

- **Pedido do contato (`update.ts`, `contato.ts`, `sender.ts`):** o chat sem telefone não chega à
  conversa. A resposta vai pela fila de saída com `teclado: 'pedirContato'`, que vira o teclado de
  resposta com o botão `request_contact`; o contato aceito responde com `teclado: 'tirarTeclado'`
  (`remove_keyboard`).
- **Recusa do cartão de outra pessoa:** só vale o contato com `contact.user_id` igual ao `from.id`.
  Um cartão de outra pessoa (ou sem `user_id`, como um contato da agenda) daria a alguém a
  identidade e o voto de outro estudante; é recusado, e o pedido se repete. Número fora de 8 a 15
  dígitos também é recusado (`normalizarTelefone` tira o `+` e o resto que não é dígito).
- **Comando pendente:** o último texto de um chat sem telefone (o `/start <payload>` de um link do
  site, ou a primeira mensagem) fica cifrado em `chat_telegram.comando_pendente_cifrado` e vai para
  a conversa quando o contato é aceito. Botão antigo, foto e documento não ficam guardados.
- **Tabela `chat_telegram`** (`packages/db/src/schema.ts`, domínio em
  `packages/dominio/src/estudante/chat-telegram.ts`): `chat_hmac` (HMAC de `tg:<chat_id>`, chave;
  o prefixo impede colisão com o `hashPhone` de mesmos dígitos), `chat_cifrado`, `telefone_hmac`
  (único: um telefone, um chat; o último a compartilhar fica com ele) e `telefone_cifrado` (os dois
  nulos ou os dois preenchidos, por `CHECK`), `comando_pendente_cifrado` e `atualizado_em`. Nada em
  claro.
- **`disparo.canal`** (enum `whatsapp | telegram`, nulo nos disparos de antes): a reserva do lote
  grava por onde o aviso saiu. A conta das 250 pessoas/24h da Meta usa o canal gravado, não o chat
  de hoje: assim ela fica certa quando a pessoa liga ou perde o chat dentro das 24h (um envio pelo
  Telegram não passa a contar, e um pelo WhatsApp não deixa de contar).
- **Ciclo de vida do chat:**
  - **403 num aviso** (a pessoa bloqueou o bot ou apagou a conta): o disparo sai da fila como falha
    permanente e, na mesma transação, o chat é apagado (`apagarChatBloqueado`, só se ainda for o
    mesmo chat do aviso). Os próximos avisos da pessoa saem pelo WhatsApp. Um 400 não apaga o chat:
    pode ser defeito da mensagem. Nas respostas da conversa, o 403 só descarta o resto do envio.
  - **"sair" do Lumens** apaga o chat ligado ao telefone.
  - **Limpeza diária** (`agendador/limpeza-conversas.ts`, 04:00 em Maceió): apaga os chats que
    nunca compartilharam o contato e estão parados há mais de um dia.
  - **Rotação da chave de cifra** (`cripto/rotacao.ts`, `scripts/rotacionar-cifra.ts`) recifra
    `chat_cifrado`, `telefone_cifrado` e `comando_pendente_cifrado`.
- **Migração 0014 (`0014_chat_telegram.sql`):** cria o enum `canal`, a tabela `chat_telegram` e a
  coluna `disparo.canal`; não reescreve estudantes nem disparos. Ela substitui a 0014 da primeira
  versão da branch (commit `a4d5706`, nunca enviada ao remoto), que usava o HMAC de `tg:<chat_id>`
  como chave do estudante, com `estudante.canal` e um cadastro por canal. As duas têm o mesmo
  timestamp no journal: quem aplicou a antiga precisa do `pnpm db:fresh` (ver o
  [README](README.md#como-rodar-local)).
- **Limitação — nono dígito:** `normalizarTelefone` não mexe no nono dígito. O wa_id de algumas
  contas brasileiras antigas vem sem ele, e o Telegram manda o número inteiro: essa pessoa vira dois
  estudantes, e o e-mail da UFAL dela é recusado no segundo canal. Nenhuma heurística foi
  acrescentada.

## Saída

- **Respostas (`sender.ts`, `formatacao.ts`):** `paraTelegram` monta os `sendMessage`; o
  `telegramSender` decifra o chat id e manda em ordem. 403 descarta o resto sem lançar; 429 espera
  o `retry_after` e reenvia; 5xx e rede lançam para o retry do pg-boss. Id de botão acima de 64
  bytes lança antes de chamar a API.
- **Avisos (`avisos.ts`):** `mensagensDoAviso` usa o corpo do catálogo (`whatsapp/modelos.ts`) com
  as variáveis, o rodapé, o botão de link para a pauta e os botões de resposta com o mesmo payload
  do WhatsApp (`tipo:aviso:índice`). O `telegramAvisoSender` não dispara em rajada (intervalo entre
  envios e 1 s por chat). Aceito vale como entregue; 403 e 400 "chat not found" são falha
  permanente do disparo, sem parar o canal, e só o 403 apaga o chat; 429 longo ou rede param o
  canal até o próximo lote.
- **Limite da Meta:** a reserva escolhe o canal de cada disparo (Telegram para quem tem chat
  ligado, se o canal está configurado; senão WhatsApp) e o grava em `disparo.canal`; o lote escolhe
  o sender pelo canal. Só o WhatsApp conta nas 250 pessoas/24h.

## Mídia

`apps/backend/src/fotos/telegram-midia.ts`: `getFile(file_id)` e depois o download do `file_path`,
com o mesmo contrato do `baixarMidiaDaMeta` (`MidiaBaixada`, `ErroDeMidia`). O tipo vem da
extensão; acima de 20 MB (pelo `file_size` ou pelo "file is too big") é recusado sem baixar.

## Configuração

`apps/backend/src/config/env.ts`:

| Variável                  | Papel                                                                             |
| ------------------------- | --------------------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`      | Liga o canal. Com ele, as quatro `META_*` ficam opcionais (as quatro ou nenhuma). |
| `TELEGRAM_MODO`           | `webhook` (padrão) ou `polling` (dev, sem túnel).                                 |
| `TELEGRAM_WEBHOOK_SECRET` | Obrigatória em `webhook`. Letras, números, `_` e `-`, até 256 caracteres.         |

Sem nenhum dos dois canais, o back-end não sobe. O back-end não chama o `setWebhook`: registrar a
URL no Telegram é passo manual do deploy.

## Simulador

`pnpm sim --canal telegram` monta `Update`s da Bot API (`apps/backend/src/bot/sim/telegram.ts`) e
faz `POST /telegram/webhook` com o header do segredo. Cada envio tem `update_id` novo, para o dedup
não engolir a repetição. Fixtures em `apps/backend/src/bot/sim/__fixtures__/telegram-*.json`.

## Riscos

- **Pontos de encontro com o Evolution.** `bot/worker.ts`, `main.ts` e `config/env.ts` foram
  mexidos antes do canal do Evolution, que a história previa primeiro. Quem entrar depois concilia.
- **Alcance.** O Telegram está em cerca de 57% dos smartphones no Brasil; quem não tem a conta não
  usa a reserva.
- **Sem a Bot API real.** Nada foi exercitado contra o Telegram de verdade, só com fakes (`fetch`
  falso nos testes, simulador contra o back-end local).
