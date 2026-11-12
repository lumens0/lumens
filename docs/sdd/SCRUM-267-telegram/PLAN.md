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
- **Um canal por processo:** o `main.ts` lê `CANAL_BOT` (`canalDoEnv`) e monta só o webhook (ou o
  polling), o `ReplySender`, o sender de avisos e o download de mídia do canal ativo. Os jobs não
  levam o canal: num processo só existe um.

## Identidade

Decidido na [SCRUM-267](../../decisoes/SCRUM-267-canal-telegram.md) (revisão de 2026-11-12):
**no Telegram a identidade é o chat, e o e-mail da UFAL liga a pessoa entre canais.**

```
update ─▶ job da conversa
            phoneHmac    = hashPhone("tg:<chat_id>")   (vira estudante.telefone_hmac)
            phoneCifrado = cifra(chat_id)              (vira estudante.telefone_cifrado: o destino)

verificação ─▶ vincularEmail
            e-mail sem dono ou desta identidade ─▶ como na main
            e-mail de outra identidade, esta sem cadastro ─▶ o cadastro do dono troca de chave
            e-mail de outra identidade, as duas com cadastro ─▶ email_em_uso
```

- **`chaveDoChat` (`update.ts`):** o prefixo `tg:` impede colisão com o `hashPhone` de um
  telefone de mesmos dígitos. O telefone não é pedido.
- **Mescla pelo e-mail (`packages/dominio/src/estudante/verificacao.ts`):** depois do código certo,
  na mesma transação e com o `FOR UPDATE` de sempre, o estudante dono do e-mail recebe o
  `telefone_hmac` e o `telefone_cifrado` da identidade nova, se ela ainda não tem cadastro (é
  sempre o caso no canal novo: o estudante só é criado nesse passo). Apoios, pautas, curso e
  `verificado_em` ficam no mesmo estudante, e os avisos pendentes saem para o endereço novo.
- **Sem migração.** Nenhuma tabela nem coluna nova: o chat id cabe em `telefone_cifrado`.

## Saída

- **Respostas (`sender.ts`, `formatacao.ts`):** `paraTelegram` monta os `sendMessage`; o
  `telegramSender` decifra o chat id (o `phoneCifrado` do job) e manda em ordem. 403 descarta o resto sem lançar; 429 espera
  o `retry_after` e reenvia; 5xx e rede lançam para o retry do pg-boss. Id de botão acima de 64
  bytes lança antes de chamar a API.
- **Avisos (`avisos.ts`):** `mensagensDoAviso` usa o corpo do catálogo (`whatsapp/modelos.ts`) com
  as variáveis, o rodapé, o botão de link para a pauta e os botões de resposta com o mesmo payload
  do WhatsApp (`tipo:aviso:índice`). O `telegramAvisoSender` não dispara em rajada (intervalo entre
  envios e 1 s por chat). Aceito vale como entregue; 403 e 400 "chat not found" são falha
  permanente do disparo; 429 longo ou rede param o lote até a próxima rodada.
- **Fila (`avisos/fila.ts`):** igual à da `main`. O destino é o `telefone_cifrado` do estudante.
  O limite é do canal: `META_LIMITE_PESSOAS` no WhatsApp; sem cota no Telegram.
- **`callback_data`:** um id acima de 64 bytes lança antes de chamar a API, em vez do mapeamento
  curto pedido na SCRUM-270. Desvio aceito: todo id que a conversa gera hoje cabe (prefixos curtos,
  UUIDs e a lista de cursos), e o teste "os ids que a conversa usa cabem no callback_data"
  (`sender.test.ts`) percorre cada gerador. Um id novo que não caiba quebra esse teste.

## Mídia

`apps/backend/src/fotos/telegram-midia.ts`: `getFile(file_id)` e depois o download do `file_path`,
com o mesmo contrato do `baixarMidiaDaMeta` (`MidiaBaixada`, `ErroDeMidia`). O tipo vem da
extensão; acima de 20 MB (pelo `file_size` ou pelo "file is too big") é recusado sem baixar.

## Configuração

`apps/backend/src/config/env.ts`:

| Variável                  | Papel                                                                            |
| ------------------------- | -------------------------------------------------------------------------------- |
| `CANAL_BOT`               | `whatsapp` (padrão) ou `telegram`. Só as variáveis do canal escolhido são lidas. |
| `TELEGRAM_BOT_TOKEN`      | Obrigatória com `CANAL_BOT=telegram`.                                            |
| `TELEGRAM_MODO`           | `webhook` (padrão) ou `polling` (dev, sem túnel).                                |
| `TELEGRAM_WEBHOOK_SECRET` | Obrigatória em `webhook`. Letras, números, `_` e `-`, até 256 caracteres.        |

Com `CANAL_BOT=telegram`, as `META_*` são ignoradas. O back-end não chama o `setWebhook`: registrar a
URL no Telegram é passo manual do deploy.

## Simulador

`pnpm sim --canal telegram` monta `Update`s da Bot API (`apps/backend/src/bot/sim/telegram.ts`) e
faz `POST /telegram/webhook` com o header do segredo. Cada envio tem `update_id` novo, para o dedup
não engolir a repetição. Fixtures em `apps/backend/src/bot/sim/__fixtures__/telegram-*.json`.

## Riscos

- **Pontos de encontro com o Evolution.** `main.ts` e `config/env.ts` (`CANAL_BOT`) foram mexidos
  antes do canal do Evolution, que a história previa primeiro. O Evolution acrescenta o valor dele
  ao `CANAL_BOT` e monta as peças dele no mesmo ponto do `main.ts`.
- **Troca de canal com conversa em andamento.** A conversa é chaveada pela identidade: quem estava no
  meio de um fluxo no canal antigo recomeça no novo. O cadastro (depois da verificação) não se perde.
- **Alcance.** O Telegram está em cerca de 57% dos smartphones no Brasil; quem não tem a conta não
  usa a reserva.
- **Sem a Bot API real.** Nada foi exercitado contra o Telegram de verdade, só com fakes (`fetch`
  falso nos testes, simulador contra o back-end local).
