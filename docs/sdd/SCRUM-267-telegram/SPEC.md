# Spec: SCRUM-267 — Canal do Telegram como reserva do bot

> Ticket: SCRUM-267 — Canal do Telegram como reserva do bot
> Contexto: a API oficial do WhatsApp está travada na Meta (número de teste sem envio para o
> Brasil, limite de contas do portfólio, portfólio novo recusado). A demonstração para a turma
> (por volta de 25/11/2026) vai pelo WhatsApp não oficial (Evolution API); o Telegram fica de
> reserva, com a mesma conversa. Decisão: [SCRUM-267](../../decisoes/SCRUM-267-canal-telegram.md).

## Comportamento principal

- **Mesma conversa, outra porta.** O update do Telegram vira o mesmo job da fila que o webhook da
  Meta gera; a conversa não sabe de onde a mensagem veio. Botão tocado (`callback_query`) chega
  como o texto do id, e `/start <payload>` chega como o comando que o link do site manda no
  WhatsApp (`nova` → `nova pauta`, `apoiar_<slug>` → `apoiar <slug>`, `ajudar_<slug>` →
  `ajudar <slug>`; `/start` sozinho ou com payload desconhecido → `menu`).
- **Identidade pelo telefone.** Um chat sem telefone não chega à conversa: recebe o pedido do
  contato, com um teclado de um botão `request_contact`. A pessoa compartilha o próprio contato; o
  telefone passa pelo mesmo `hashPhone` do WhatsApp, e a pessoa é o mesmo estudante nos dois
  canais. Contato de outra pessoa (`contact.user_id` ≠ `from.id`, ou sem `user_id`) é recusado, e o
  pedido se repete. O texto que chegou antes do contato (o `/start` de um link do site, por
  exemplo) fica guardado e roda depois que o contato é aceito; sem nada guardado, abre o menu.
- **Saída.** As respostas viram `sendMessage` em texto puro: botões e listas viram teclado inline
  (um botão por linha, `callback_data` = id do botão), o `*negrito*` vira `entities`, e nunca há
  `parse_mode`. Texto acima de 4096 caracteres é dividido, com o teclado na última parte.
- **Avisos.** Saem pelo Telegram para quem tem chat ligado ao telefone, com o texto do catálogo
  de modelos, sem gastar o limite de 250 pessoas/24h da Meta. `sendMessage` aceito vale como
  enviado e entregue; 403 (bot bloqueado) é falha permanente e apaga o chat, e os próximos avisos
  da pessoa saem pelo WhatsApp.
- **Mídia.** Foto (a maior resolução) e documento chegam pelo `file_id` e são baixados com o
  `getFile`, até o limite de 20 MB da Bot API.
- **Configuração.** O canal liga só com `TELEGRAM_BOT_TOKEN`. Em `TELEGRAM_MODO=webhook` (padrão) a
  rota `POST /telegram/webhook` confere o `X-Telegram-Bot-Api-Secret-Token`; em
  `TELEGRAM_MODO=polling` o back-end busca os updates com `getUpdates` e a rota não existe.

## Critérios de aceitação

Da história, como escritos no Jira. Marcado só o que tem teste apontável; todos os testes usam
uma Bot API falsa (nada foi exercitado contra o Telegram de verdade).

- [ ] Conversa completa pelo Telegram, com listas e botões como teclado inline nativo.
      _As peças têm teste — botões e listas em teclado inline (`bot/telegram/sender.test.ts`),
      toque no botão como texto (`bot/telegram/update.test.ts`), resposta pelo canal do job
      (`bot/worker.test.ts`) — mas nenhum teste percorre uma conversa inteira pelo Telegram._
- [x] Contato compartilhado de outra pessoa (contact.user_id diferente de from.id) é recusado.
      — `apps/backend/src/bot/telegram/update.test.ts` ("contato de outra pessoa … é recusado e o
      pedido se repete").
- [x] Com o mesmo telefone, a pessoa é o mesmo estudante no WhatsApp e no Telegram (mesmo
      hashPhone). — `apps/backend/src/bot/telegram/update.test.ts` ("com o mesmo telefone, o chat é
      a mesma pessoa do WhatsApp") e `apps/backend/src/bot/conversation/verificacao.test.ts`
      ("pelo Telegram, com o mesmo telefone, a verificação do WhatsApp continua valendo").
- [x] Webhook sem o X-Telegram-Bot-Api-Secret-Token correto é recusado.
      — `apps/backend/src/bot/telegram/routes.test.ts` ("sem segredo ou com segredo errado → 401 e
      nada na fila").
- [x] Aviso chega a quem falou com o bot; quem bloqueou o bot (erro 403) sai da fila como falha
      permanente. — `packages/dominio/src/avisos/fila.test.ts` (quem tem chat sai pelo Telegram),
      `apps/backend/src/bot/telegram/avisos.test.ts` (aceito vale como entregue; 403 é falha
      permanente) e `apps/backend/src/bot/envio/worker.test.ts` ("403 tira só aquele disparo da
      fila, de vez"; "403 apaga o chat").
- [x] O canal liga só quando TELEGRAM_BOT_TOKEN está definido e convive com o WhatsApp.
      — `apps/backend/src/config/env.test.ts` ("canais do bot (WhatsApp e Telegram)"),
      `apps/backend/src/bot/envio/worker.test.ts` ("erro que para o Telegram não para o WhatsApp do
      mesmo lote") e `apps/backend/src/bot/worker.test.ts` ("canal (Telegram)").
- [ ] Testes falham sem a implementação; pnpm sim aceita o formato do Telegram.
      _A segunda metade tem teste (`apps/backend/src/bot/sim/telegram.test.ts`: construtores e
      fixtures passam no `updateSchema` real). A primeira não foi verificada: ninguém rodou os
      testes contra o código sem a implementação._
- [ ] Registro de decisão em docs/decisoes/ e SDD em docs/sdd/.
      _Os documentos existem ([decisão](../../decisoes/SCRUM-267-canal-telegram.md) e este SDD),
      mas não é critério com teste; a aprovação está pendente no [README](README.md#aprovação)._

**Corte para a demonstração** (da história): a migração do chat id, os avisos e as fotos podem
ficar para depois; a demonstração só precisa da conversa.

## Contextuais

- **Atores:** estudante no app do Telegram, em chat privado com o bot; o dev, pelo simulador.
- **Casos de borda:** update de grupo, canal ou de outro bot (ignorado); botão de aviso sem
  tratamento (respondido com um aviso curto, não entra na conversa); `update_id` repetido (dedup);
  arquivo acima de 20 MB; 429 com `retry_after`; texto com emoji no limite de corte; `callback_data`
  acima de 64 bytes; slug acima de 57 caracteres no `start`; cartão de contato sem `user_id` ou com
  número ilegível (recusado); a mesma pessoa compartilhando o telefone de outra conta do Telegram
  (o chat antigo perde a ligação); chat que nunca manda o contato (apagado pela limpeza diária).
- **Limitações conhecidas:** o wa_id da Meta de algumas contas brasileiras antigas vem sem o nono
  dígito, e o Telegram manda o número inteiro: essa pessoa vira dois estudantes, e o e-mail da UFAL
  é recusado no segundo canal. Nenhuma heurística foi acrescentada (ver o comentário em
  `apps/backend/src/bot/telegram/contato.ts`).
- **Fora de escopo:** o canal do Evolution e a decisão sobre ele; tratar "Apoiar" e as respostas
  rápidas da conferência (lacunas nos dois canais); qualquer mudança no comportamento do WhatsApp
  oficial.

## Padrões aplicáveis

- Nenhum catálogo `.agent/patterns/`. Segue o webhook da Meta (`apps/backend/src/bot/webhook/`):
  dedup e enfileiramento antes do 200, numa transação curta; nada em claro no banco nem no log.
